import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sessionRPC: vi.fn(),
    alert: vi.fn(),
    storageState: {
        sessions: {} as Record<string, any>,
        applySessions: vi.fn(),
        applySettings: vi.fn(),
        applySettingsLocal: vi.fn(),
        getActiveSessions: vi.fn(),
        isMutableToolCall: vi.fn(),
        setSocketStatus: vi.fn(),
    },
    randomUUID: vi.fn(),
    trackMessageSent: vi.fn(),
    gitStatusInvalidate: vi.fn(),
    gitStatusGetSyncInvalidate: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: {
        sessionRPC: mocks.sessionRPC,
        initialize: vi.fn(),
        onStatusChange: vi.fn(),
        onReconnected: vi.fn(),
        request: vi.fn(),
        emitWithAck: vi.fn(),
    },
    getHappyClientId: vi.fn(() => 'client-1'),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'web' },
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(),
    },
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => mocks.storageState,
    },
}));

vi.mock('./gitStatusSync', () => ({
    gitStatusSync: {
        invalidate: mocks.gitStatusInvalidate,
        clearForSession: vi.fn(),
        getSync: vi.fn(() => ({ invalidate: mocks.gitStatusGetSyncInvalidate })),
    },
}));

vi.mock('@/modal', () => ({
    Modal: { alert: mocks.alert },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/track', () => ({
    initializeTracking: vi.fn(),
    trackGitHubConnected: vi.fn(),
    trackMessageSent: mocks.trackMessageSent,
    tracking: null,
    trackPaywallCancelled: vi.fn(),
    trackPaywallError: vi.fn(),
    trackPaywallPresented: vi.fn(),
    trackPaywallPurchased: vi.fn(),
    trackPaywallRestored: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
    randomUUID: mocks.randomUUID,
}));

vi.mock('expo-notifications', () => ({
    scheduleNotificationAsync: vi.fn(),
    dismissNotificationAsync: vi.fn(),
}));

vi.mock('expo-modules-core', () => ({
    requireOptionalNativeModule: vi.fn(() => null),
    EventEmitter: class { },
}));

vi.mock('./encryption/encryption', () => ({
    Encryption: { create: vi.fn() },
}));

vi.mock('./encryption/encryptionCache', () => ({
    EncryptionCache: class { },
}));

vi.mock('./encryption/artifactEncryption', () => ({
    ArtifactEncryption: class { },
}));

vi.mock('./pushRegistration', () => ({
    syncCurrentPushToken: vi.fn(),
}));

vi.mock('./revenueCat', () => ({
    RevenueCat: class { },
    LogLevel: { DEBUG: 'debug' },
    PaywallResult: {},
}));

vi.mock('@/config', () => ({
    config: {},
}));

vi.mock('./serverConfig', () => ({
    getServerUrl: vi.fn(() => 'https://example.invalid'),
}));

vi.mock('@/realtime/hooks/voiceHooks', () => ({
    voiceHooks: {
        onSessionFocus: vi.fn(),
        onSessionOnline: vi.fn(),
        onSessionOffline: vi.fn(),
        onNewMessages: vi.fn(),
        onReady: vi.fn(),
        onPermissionRequest: vi.fn(),
        onPermissionRequested: vi.fn(),
    },
}));

vi.mock('@/utils/platform', () => ({
    isRunningOnMac: () => false,
}));

import { apiSocket } from './apiSocket';
import { sessionWriteFile } from './ops';
import { generateLocalMessageId, sync } from './sync';
import { Modal } from '@/modal';

type StoredSession = Record<string, any>;

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
    return {
        id: 'session-1',
        metadata: {
            flavor: 'claude',
            path: '/repo',
            host: 'host',
        },
        agentState: {
            controlledByUser: true,
        },
        permissionModeUserChosen: false,
        ...overrides,
    };
}

function resetStorageHarness() {
    mocks.storageState.sessions = {};
    mocks.storageState.applySessions.mockImplementation((sessions: StoredSession[]) => {
        for (const session of sessions) {
            mocks.storageState.sessions[session.id] = session;
        }
    });
    mocks.storageState.getActiveSessions.mockImplementation(() => Object.values(mocks.storageState.sessions));
    mocks.storageState.isMutableToolCall.mockReturnValue(false);
}

function installSyncHarness(options: { session?: StoredSession | null; encryptRawRecord?: ReturnType<typeof vi.fn> } = {}) {
    const encryptRawRecord = options.encryptRawRecord ?? vi.fn(async () => 'encrypted-record');
    const session = options.session === undefined ? makeSession() : options.session;
    mocks.storageState.sessions = session ? { 'session-1': session } : {};
    mocks.randomUUID.mockReturnValue('local-1');

    (sync as any).encryption = {
        getSessionEncryption: vi.fn(() => session ? { encryptRawRecord } : undefined),
    };
    (sync as any).pendingOutbox = new Map();
    (sync as any).sessionMessageQueue = new Map();
    (sync as any).deferredSwitchRequests = new Set();
    vi.spyOn(sync as any, 'enqueueMessages').mockImplementation(() => undefined);
    vi.spyOn(sync as any, 'getSendSync').mockReturnValue({ invalidate: vi.fn() });
    vi.spyOn(sync as any, 'maybeStartBackgroundSendWatchdog').mockImplementation(() => undefined);

    return { encryptRawRecord };
}

function makeEncryptedUpdate() {
    return {
        id: 'update-1',
        seq: 1,
        createdAt: 200,
        body: {
            t: 'new-message',
            sid: 'session-1',
            message: {
                id: 'message-1',
                seq: 1,
                localId: null,
                content: { t: 'encrypted', c: 'ciphertext' },
                createdAt: 100,
                updatedAt: 100,
            },
        },
    };
}

function installIncomingMessageHarness(content: unknown, session: StoredSession) {
    mocks.storageState.sessions = { 'session-1': session };

    (sync as any).encryption = {
        getSessionEncryption: vi.fn(() => ({
            decryptMessage: vi.fn(async () => ({
                id: 'message-1',
                localId: null,
                createdAt: 100,
                seq: 1,
                content,
            })),
        })),
    };
    vi.spyOn(sync as any, 'getMessagesSync').mockReturnValue({ invalidate: vi.fn() });
    vi.spyOn(sync as any, 'onSessionVisible').mockImplementation(() => undefined);
}

describe('sync.sendMessage switch policy', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
        mocks.sessionRPC.mockResolvedValue({ deferred: true });
        mocks.randomUUID.mockReturnValue('local-1');
    });

    it('defaults to tagless local enqueue without request-switch RPC', async () => {
        const { encryptRawRecord } = installSyncHarness();

        await sync.sendMessage('session-1', 'hello');

        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(encryptRawRecord).toHaveBeenCalledOnce();
        expect(encryptRawRecord.mock.calls[0][0].meta.capabilities).toBeUndefined();
        expect((sync as any).pendingOutbox.get('session-1')).toHaveLength(1);
    });

    it('exposes a local message id generator backed by randomUUID', () => {
        mocks.randomUUID.mockReturnValueOnce('generated-local-id');

        expect(generateLocalMessageId()).toBe('generated-local-id');
        expect(mocks.randomUUID).toHaveBeenCalledOnce();
    });

    it('uses caller-provided localId and preserves attachment refs in message metadata', async () => {
        const { encryptRawRecord } = installSyncHarness();

        await sync.sendMessage('session-1', 'hello with file', {
            localId: 'caller-local-id',
            attachmentRefs: [{ remotePath: '.happy/attachments/caller-local-id/file.txt', name: 'file.txt', size: 12 }],
            displayText: 'hello',
            source: 'chat',
        });

        expect(mocks.randomUUID).not.toHaveBeenCalled();
        expect(encryptRawRecord).toHaveBeenCalledOnce();
        expect(encryptRawRecord.mock.calls[0][0].meta.attachmentRefs).toEqual([
            { remotePath: '.happy/attachments/caller-local-id/file.txt', name: 'file.txt', size: 12 },
        ]);
        expect(encryptRawRecord.mock.calls[0][0].meta.displayText).toBe('hello');
        expect((sync as any).pendingOutbox.get('session-1')).toEqual([
            { localId: 'caller-local-id', content: 'encrypted-record' },
        ]);
    });

    it("treats switchMode none like now: no RPC and no deferred-switch tag", async () => {
        const { encryptRawRecord } = installSyncHarness();

        await sync.sendMessage('session-1', 'hello', { switchMode: 'none', source: 'option' });

        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(encryptRawRecord.mock.calls[0][0].meta.capabilities).toBeUndefined();
    });

    it('includes image attachments in the encrypted user message content', async () => {
        const { encryptRawRecord } = installSyncHarness();
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,abc123', mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect(encryptRawRecord).toHaveBeenCalledOnce();
        expect(encryptRawRecord.mock.calls[0][0].content).toEqual({
            type: 'text',
            text: 'hello',
            attachments,
        });
    });

    it.each([
        ['codex', makeSession({ metadata: { flavor: 'codex', path: '/repo', host: 'host' } })],
        ['undefined flavor', makeSession({ metadata: { path: '/repo', host: 'host' } })],
    ])('strips image attachments before encryption for non-Claude flavor: %s', async (_name, session) => {
        const { encryptRawRecord } = installSyncHarness({ session });
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,abc123', mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect(encryptRawRecord).toHaveBeenCalledOnce();
        expect(encryptRawRecord.mock.calls[0][0].content).toEqual({
            type: 'text',
            text: 'hello',
        });
        expect(encryptRawRecord.mock.calls[0][0].content.attachments).toBeUndefined();
    });

    it('rejects image attachments larger than 4 MB encoded before encrypting', async () => {
        const { encryptRawRecord } = installSyncHarness();
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,' + 'a'.repeat(4 * 1024 * 1024 + 1), mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect(encryptRawRecord).not.toHaveBeenCalled();
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.attachmentTooLarge');
    });

    it('requests when-idle before enqueueing and tags only deferred responses', async () => {
        const order: string[] = [];
        mocks.sessionRPC.mockImplementation(async () => {
            order.push('rpc');
            return { deferred: true };
        });
        const { encryptRawRecord } = installSyncHarness({
            encryptRawRecord: vi.fn(async () => {
                order.push('encrypt');
                return 'encrypted-record';
            }),
        });

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(order).toEqual(['rpc', 'encrypt']);
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', { mode: 'when-idle', messagePreview: 'hello' });
        expect(encryptRawRecord.mock.calls[0][0].meta.capabilities).toEqual({ deferredSwitch: true });
    });

    it('omits the tag when when-idle short-circuits to an immediate switch', async () => {
        mocks.sessionRPC.mockResolvedValue({ deferred: false });
        const { encryptRawRecord } = installSyncHarness();

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(apiSocket.sessionRPC).toHaveBeenCalledOnce();
        expect(encryptRawRecord.mock.calls[0][0].meta.capabilities).toBeUndefined();
    });

    it.each([
        ['non-Claude local', makeSession({ metadata: { flavor: 'codex', path: '/repo', host: 'host' } })],
        ['Claude remote', makeSession({ agentState: { controlledByUser: false } })],
        ['Claude unknown mode', makeSession({ agentState: {} })],
    ])('degrades when-idle to tagless enqueue for %s sessions', async (_name, session) => {
        const { encryptRawRecord } = installSyncHarness({ session });

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(encryptRawRecord.mock.calls[0][0].meta.capabilities).toBeUndefined();
    });

    it('surfaces when-idle preflight failure without RPC or enqueue', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        installSyncHarness({ session: null });

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('not found');

        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.sendFailed');
        expect((sync as any).pendingOutbox.get('session-1')).toBeUndefined();
    });

    it('surfaces request-switch failure without enqueueing', async () => {
        mocks.sessionRPC.mockRejectedValue(new Error('rpc failed'));
        const { encryptRawRecord } = installSyncHarness();

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('rpc failed');

        expect(encryptRawRecord).not.toHaveBeenCalled();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.requestSwitchFailed');
        expect((sync as any).pendingOutbox.get('session-1')).toBeUndefined();
    });

    it('does NOT call cancel-pending-switch when request-switch deferred but enqueue fails', async () => {
        mocks.sessionRPC.mockResolvedValueOnce({ deferred: true });
        const encryptRawRecord = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        installSyncHarness({ encryptRawRecord });

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('enqueue failed');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mocks.sessionRPC).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', { mode: 'when-idle', messagePreview: 'hello' });
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.sendFailed');
    });

    it('does not call cancel-pending-switch when request-switch was not deferred', async () => {
        mocks.sessionRPC.mockResolvedValueOnce({ deferred: false });
        const encryptRawRecord = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        installSyncHarness({ encryptRawRecord });

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('enqueue failed');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mocks.sessionRPC).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', { mode: 'when-idle', messagePreview: 'hello' });
    });

    it('now send failures do not throw to the caller (fire-and-forget)', async () => {
        const encryptRawRecord = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        installSyncHarness({ encryptRawRecord });

        await expect(sync.sendMessage('session-1', 'hello')).resolves.toBeUndefined();
        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'now' })).resolves.toBeUndefined();
        expect(Modal.alert).not.toHaveBeenCalled();
    });

    it('sends messagePreview truncated to 80 chars with newlines collapsed', async () => {
        mocks.sessionRPC.mockResolvedValue({ deferred: true });
        installSyncHarness();

        const long = 'a'.repeat(90);
        await sync.sendMessage('session-1', long, { switchMode: 'when-idle' });
        expect(mocks.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', {
            mode: 'when-idle',
            messagePreview: 'a'.repeat(80) + '…',
        });

        mocks.sessionRPC.mockClear();
        mocks.sessionRPC.mockResolvedValue({ deferred: true });

        const multiline = 'line1\nline2\nline3';
        await sync.sendMessage('session-1', multiline, { switchMode: 'when-idle' });
        expect(mocks.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', {
            mode: 'when-idle',
            messagePreview: 'line1 line2 line3',
        });
    });

    it('latches concurrent when-idle RPCs per session and clears after settlement', async () => {
        let resolveFirst!: (value: { deferred: boolean }) => void;
        mocks.sessionRPC.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
        const { encryptRawRecord } = installSyncHarness();

        const first = sync.sendMessage('session-1', 'first', { switchMode: 'when-idle' });
        await expect(sync.sendMessage('session-1', 'second', { switchMode: 'when-idle' })).rejects.toThrow('request-switch already pending');

        expect(apiSocket.sessionRPC).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(encryptRawRecord).not.toHaveBeenCalled();

        mocks.sessionRPC.mockResolvedValue({ deferred: true });
        resolveFirst({ deferred: true });
        await first;
        await sync.sendMessage('session-1', 'third', { switchMode: 'when-idle' });

        expect(apiSocket.sessionRPC).toHaveBeenCalledTimes(2);
    });

    it('supports upload-before-send callers without sendMessage dispatching upload RPCs', async () => {
        const order: string[] = [];
        mocks.randomUUID.mockReturnValueOnce('local-upload-id');
        mocks.sessionRPC.mockImplementation(async (_sessionId: string, method: string, params: { path?: string }) => {
            order.push(`${method}:${params.path ?? ''}`);
            return { success: true, hash: 'hash-1' };
        });
        const { encryptRawRecord } = installSyncHarness({
            encryptRawRecord: vi.fn(async () => {
                order.push('sendMessage');
                return 'encrypted-record';
            }),
        });

        const localId = generateLocalMessageId();
        const remotePath = `.happy/attachments/${localId}/note.txt`;
        await sessionWriteFile('session-1', remotePath, 'bm90ZQ==', { createParents: true });
        await sync.sendMessage('session-1', `attached ${remotePath}`, {
            localId,
            attachmentRefs: [{ remotePath, name: 'note.txt', size: 4 }],
        });

        expect(localId).toBe('local-upload-id');
        expect(order).toEqual([`writeFile:${remotePath}`, 'sendMessage']);
        expect(mocks.sessionRPC).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRPC).toHaveBeenCalledWith('session-1', 'writeFile', {
            path: remotePath,
            content: 'bm90ZQ==',
            createParents: true,
        });
        expect(encryptRawRecord.mock.calls[0][0].meta.attachmentRefs).toEqual([{ remotePath, name: 'note.txt', size: 4 }]);
    });

    it('lets upload-before-send callers stop before sendMessage on upload failure', async () => {
        mocks.randomUUID.mockReturnValueOnce('local-upload-id');
        mocks.sessionRPC.mockRejectedValueOnce(new Error('upload failed'));
        installSyncHarness();
        const sendSpy = vi.spyOn(sync, 'sendMessage');

        const uploadThenSend = async () => {
            const localId = generateLocalMessageId();
            const remotePath = `.happy/attachments/${localId}/note.txt`;
            const upload = await sessionWriteFile('session-1', remotePath, 'bm90ZQ==', { createParents: true });
            if (!upload.success) {
                throw new Error(upload.error ?? 'upload failed');
            }
            await sync.sendMessage('session-1', `attached ${remotePath}`, { localId, attachmentRefs: [{ remotePath, name: 'note.txt', size: 4 }] });
        };

        await expect(uploadThenSend()).rejects.toThrow('upload failed');
        expect(sendSpy).not.toHaveBeenCalled();
    });
});

describe('sync update-session git-status invalidation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        mocks.storageState.sessions = {};
    });

    function installUpdateHarness(metadata: Record<string, unknown>) {
        const session = makeSession({
            metadata: { flavor: 'claude', path: '/repo/old', host: 'host' },
            metadataVersion: 1,
            agentStateVersion: 1,
            agentState: { controlledByUser: true },
        });
        mocks.storageState.sessions = { 'session-1': session };
        (sync as any).encryption = {
            getSessionEncryption: vi.fn(() => ({
                decryptMetadata: vi.fn(async () => metadata),
                decryptAgentState: vi.fn(),
            })),
        };
        vi.spyOn(sync as any, 'applySessions').mockImplementation(() => undefined);
    }

    it('invalidates git status when update-session metadata changes only the working directory path', async () => {
        installUpdateHarness({ flavor: 'claude', path: '/repo/new', host: 'host' });

        await (sync as any).handleUpdate({
            id: 'update-1',
            seq: 1,
            createdAt: 100,
            body: {
                t: 'update-session',
                id: 'session-1',
                metadata: { version: 2, value: 'encrypted-metadata' },
            },
        });

        expect(mocks.gitStatusInvalidate).toHaveBeenCalledWith('session-1');
    });

    it('does not invalidate git status when update-session leaves agentState and metadata.path unchanged', async () => {
        installUpdateHarness({ flavor: 'claude', path: '/repo/old', host: 'host' });

        await (sync as any).handleUpdate({
            id: 'update-1',
            seq: 1,
            createdAt: 100,
            body: {
                t: 'update-session',
                id: 'session-1',
                metadata: { version: 2, value: 'encrypted-metadata' },
            },
        });

        expect(mocks.gitStatusInvalidate).not.toHaveBeenCalled();
    });
});

describe('sync new-message lifecycle state', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
    });

    it('sets thinking on turn-start session envelopes', async () => {
        installIncomingMessageHarness({
            role: 'session',
            content: {
                id: 'env-start',
                time: 100,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-start' },
            },
        }, makeSession({ thinking: false }));

        await (sync as any).handleUpdate(makeEncryptedUpdate());

        expect(mocks.storageState.applySessions).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'session-1', thinking: true, updatedAt: 200 }),
        ]);
        expect(mocks.storageState.sessions['session-1'].thinking).toBe(true);
    });

    it('clears thinking on turn-end session envelopes', async () => {
        installIncomingMessageHarness({
            role: 'session',
            content: {
                id: 'env-end',
                time: 100,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-end', status: 'completed' },
            },
        }, makeSession({ thinking: true }));

        await (sync as any).handleUpdate(makeEncryptedUpdate());

        expect(mocks.storageState.applySessions).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'session-1', thinking: false, updatedAt: 200 }),
        ]);
        expect(mocks.storageState.sessions['session-1'].thinking).toBe(false);
    });
});

function collectTsFiles(dir: string, results: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'build' || entry === 'dist') {
            continue;
        }
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            collectTsFiles(full, results);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
            results.push(full);
        }
    }
    return results;
}

describe('sync.sendMessage call-site audit', () => {
    it('keeps direct production callers on the reviewed send surfaces', () => {
        const sourcesRoot = resolve(__dirname, '..');
        const repoRoot = resolve(sourcesRoot, '../../..');
        const files = collectTsFiles(sourcesRoot);

        const matchingFiles = files
            .filter(f => readFileSync(f, 'utf8').includes('sync.sendMessage'))
            .map(f => relative(repoRoot, f).replace(/\\/g, '/'))
            .filter(p => !p.includes('.test.'))
            .filter(p => p !== 'packages/happy-app/sources/sync/sync.ts');

        expect([...new Set(matchingFiles)].sort()).toEqual([
            'packages/happy-app/sources/-session/SessionView.tsx',
            'packages/happy-app/sources/app/(app)/new/index.tsx',
            'packages/happy-app/sources/components/MessageView.tsx',
            'packages/happy-app/sources/realtime/realtimeClientTools.ts',
        ].sort());
    }, 30_000);
});
