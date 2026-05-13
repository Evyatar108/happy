import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sessionRpc: vi.fn(),
    sessionRequest: vi.fn(),
    sessionEmitWithAck: vi.fn(),
    tunnelFetch: vi.fn(),
    alert: vi.fn(),
    messageHandlers: new Map<string, (data: any, machineId: string) => void>(),
    reconnectedListeners: [] as Array<(machineId: string) => void>,
    storageState: {
        sessions: {} as Record<string, any>,
        machines: {} as Record<string, any>,
        settings: {} as Record<string, any>,
        profile: {} as Record<string, any>,
        lastSeenUpdateSeqByMachineId: {} as Record<string, number>,
        applySessions: vi.fn(),
        applyMachines: vi.fn(),
        applyProfile: vi.fn(),
        applySettings: vi.fn(),
        applySettingsLocal: vi.fn(),
        deleteMachine: vi.fn(),
        deleteSession: vi.fn(),
        getActiveSessions: vi.fn(),
        isMutableToolCall: vi.fn(),
        markMachineDisconnected: vi.fn(),
        setLastSeenUpdateSeq: vi.fn(),
        resetLastSeenUpdateSeq: vi.fn(),
        setSocketStatus: vi.fn(),
    },
    randomUUID: vi.fn(),
    trackMessageSent: vi.fn(),
    gitStatusInvalidate: vi.fn(),
    gitStatusGetSyncInvalidate: vi.fn(),
}));

vi.mock('./apiSocket', async () => {
    const { parseCompositeSessionId } = await import('./machineSessionId');
    const FALLBACK_MACHINE_ID = 'primary-machine';
    return {
        apiSocket: {
            forSession: vi.fn((sessionId: string) => ({
                ref: parseCompositeSessionId(sessionId, FALLBACK_MACHINE_ID),
                rpc: mocks.sessionRpc,
                machineRpc: vi.fn(),
                request: mocks.sessionRequest,
                emitWithAck: mocks.sessionEmitWithAck,
                send: vi.fn(),
            })),
            forMachine: vi.fn(),
            forPrimaryMachine: vi.fn(),
            initialize: vi.fn(),
            onStatusChange: vi.fn(),
            onMessage: vi.fn((event: string, handler: (data: any, machineId: string) => void) => {
                mocks.messageHandlers.set(event, handler);
                return () => mocks.messageHandlers.delete(event);
            }),
            onMachineDisconnected: vi.fn(),
            onDeviceCodeExpired: vi.fn(),
            onReconnected: vi.fn((listener: (machineId: string) => void) => {
                mocks.reconnectedListeners.push(listener);
                return () => {
                    mocks.reconnectedListeners = mocks.reconnectedListeners.filter(item => item !== listener);
                };
            }),
        },
        getHappyClientId: vi.fn(() => 'client-1'),
    };
});

vi.mock('@/auth/machineAuth', () => ({
    tunnelFetch: mocks.tunnelFetch,
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
    mocks.storageState.machines = {};
    mocks.storageState.profile = {};
    mocks.storageState.lastSeenUpdateSeqByMachineId = {};
    mocks.storageState.applySessions.mockImplementation((sessions: StoredSession[]) => {
        for (const session of sessions) {
            mocks.storageState.sessions[session.id] = session;
        }
    });
    mocks.storageState.applyMachines.mockImplementation((machines: StoredSession[]) => {
        for (const machine of machines) {
            mocks.storageState.machines[machine.id] = machine;
        }
    });
    mocks.storageState.setLastSeenUpdateSeq.mockImplementation((machineId: string, seq: number) => {
        mocks.storageState.lastSeenUpdateSeqByMachineId[machineId] = Math.max(
            mocks.storageState.lastSeenUpdateSeqByMachineId[machineId] ?? 0,
            seq,
        );
    });
    mocks.storageState.resetLastSeenUpdateSeq.mockImplementation((machineId: string, seq: number) => {
        mocks.storageState.lastSeenUpdateSeqByMachineId[machineId] = seq;
    });
    mocks.storageState.getActiveSessions.mockImplementation(() => Object.values(mocks.storageState.sessions));
    mocks.storageState.isMutableToolCall.mockReturnValue(false);
    mocks.messageHandlers.clear();
    mocks.reconnectedListeners = [];
}

function installSyncHarness(options: { session?: StoredSession | null } = {}) {
    const session = options.session === undefined ? makeSession() : options.session;
    mocks.storageState.sessions = session ? { 'session-1': session } : {};
    mocks.randomUUID.mockReturnValue('local-1');

    (sync as any).pendingOutbox = new Map();
    (sync as any).sessionMessageQueue = new Map();
    (sync as any).deferredSwitchRequests = new Set();
    vi.spyOn(sync as any, 'enqueueMessages').mockImplementation(() => undefined);
    vi.spyOn(sync as any, 'getSendSync').mockReturnValue({ invalidate: vi.fn() });
    vi.spyOn(sync as any, 'maybeStartBackgroundSendWatchdog').mockImplementation(() => undefined);

    return {};
}

function getPendingRecord(sessionId = 'session-1') {
    const pending = (sync as any).pendingOutbox.get(sessionId);
    expect(pending).toHaveLength(1);
    return JSON.parse(pending[0].content);
}

function makePlainUpdate(content: unknown, seq = 1) {
    return {
        id: `update-${seq}`,
        seq,
        createdAt: 200,
        body: {
            t: 'new-message',
            sid: 'session-1',
            message: {
                id: `message-${seq}`,
                seq,
                localId: null,
                content: { t: 'encrypted', c: JSON.stringify(content) },
                createdAt: 100,
                updatedAt: 100,
            },
        },
    };
}

function installIncomingMessageHarness(_content: unknown, session: StoredSession) {
    mocks.storageState.sessions = { 'session-1': session };
    vi.spyOn(sync as any, 'getMessagesSync').mockReturnValue({ invalidate: vi.fn() });
    vi.spyOn(sync as any, 'onSessionVisible').mockImplementation(() => undefined);
}

function makeUpdate(seq: number, body: Record<string, unknown>) {
    return {
        id: `update-${seq}`,
        seq,
        createdAt: 200 + seq,
        body,
    };
}

function installWs3SyncHarness() {
    const sessionsSync = {
        invalidate: vi.fn(),
        invalidateAndAwait: vi.fn(async () => undefined),
    };
    const machinesSync = { invalidate: vi.fn() };
    (sync as any).sessionsSync = sessionsSync;
    (sync as any).machinesSync = machinesSync;
    (sync as any).sendSync = new Map();
    (sync as any).pendingNewMessages = new Map();
    (sync as any).sessionInitInFlight = new Set();
    (sync as any).prefetchPendingPromises = new Map();
    return { sessionsSync, machinesSync };
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('sync.sendMessage switch policy', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
        mocks.sessionRpc.mockResolvedValue({ deferred: true });
        mocks.randomUUID.mockReturnValue('local-1');
    });

    it('defaults to tagless local enqueue without request-switch RPC', async () => {
        installSyncHarness();

        await sync.sendMessage('session-1', 'hello');

        expect(mocks.sessionRpc).not.toHaveBeenCalled();
        expect(getPendingRecord().meta.capabilities).toBeUndefined();
        expect((sync as any).pendingOutbox.get('session-1')).toHaveLength(1);
    });

    it('exposes a local message id generator backed by randomUUID', () => {
        mocks.randomUUID.mockReturnValueOnce('generated-local-id');

        expect(generateLocalMessageId()).toBe('generated-local-id');
        expect(mocks.randomUUID).toHaveBeenCalledOnce();
    });

    it('uses caller-provided localId and preserves attachment refs in message metadata', async () => {
        installSyncHarness();

        await sync.sendMessage('session-1', 'hello with file', {
            localId: 'caller-local-id',
            attachmentRefs: [{ remotePath: '.happy/attachments/caller-local-id/file.txt', name: 'file.txt', size: 12 }],
            displayText: 'hello',
            source: 'chat',
        });

        expect(mocks.randomUUID).not.toHaveBeenCalled();
        expect(getPendingRecord().meta.attachmentRefs).toEqual([
            { remotePath: '.happy/attachments/caller-local-id/file.txt', name: 'file.txt', size: 12 },
        ]);
        expect(getPendingRecord().meta.displayText).toBe('hello');
        expect((sync as any).pendingOutbox.get('session-1')).toEqual([
            { localId: 'caller-local-id', content: expect.any(String) },
        ]);
    });

    it("treats switchMode none like now: no RPC and no deferred-switch tag", async () => {
        installSyncHarness();

        await sync.sendMessage('session-1', 'hello', { switchMode: 'none', source: 'option' });

        expect(mocks.sessionRpc).not.toHaveBeenCalled();
        expect(getPendingRecord().meta.capabilities).toBeUndefined();
    });

    it('includes image attachments in the user message content', async () => {
        installSyncHarness();
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,abc123', mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect(getPendingRecord().content).toEqual({
            type: 'text',
            text: 'hello',
            attachments,
        });
    });

    it.each([
        ['codex', makeSession({ metadata: { flavor: 'codex', path: '/repo', host: 'host' } })],
        ['undefined flavor', makeSession({ metadata: { path: '/repo', host: 'host' } })],
    ])('strips image attachments for non-Claude flavor: %s', async (_name, session) => {
        installSyncHarness({ session });
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,abc123', mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect(getPendingRecord().content).toEqual({
            type: 'text',
            text: 'hello',
        });
        expect(getPendingRecord().content.attachments).toBeUndefined();
    });

    it('rejects image attachments larger than 4 MB encoded', async () => {
        installSyncHarness();
        const attachments = [
            { type: 'image' as const, ref: 'data:image/png;base64,' + 'a'.repeat(4 * 1024 * 1024 + 1), mimeType: 'image/png' }
        ];

        await sync.sendMessage('session-1', 'hello', { attachments });

        expect((sync as any).pendingOutbox.get('session-1') ?? []).toHaveLength(0);
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.attachmentTooLarge');
    });

    it('requests when-idle before enqueueing and tags only deferred responses', async () => {
        mocks.sessionRpc.mockImplementation(async () => {
            return { deferred: true };
        });
        installSyncHarness();

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(mocks.sessionRpc).toHaveBeenCalledWith('request-switch', { mode: 'when-idle', messagePreview: 'hello' });
        expect(getPendingRecord().meta.capabilities).toEqual({ deferredSwitch: true });
    });

    it('omits the tag when when-idle short-circuits to an immediate switch', async () => {
        mocks.sessionRpc.mockResolvedValue({ deferred: false });
        installSyncHarness();

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(mocks.sessionRpc).toHaveBeenCalledOnce();
        expect(getPendingRecord().meta.capabilities).toBeUndefined();
    });

    it.each([
        ['non-Claude local', makeSession({ metadata: { flavor: 'codex', path: '/repo', host: 'host' } })],
        ['Claude remote', makeSession({ agentState: { controlledByUser: false } })],
        ['Claude unknown mode', makeSession({ agentState: {} })],
    ])('degrades when-idle to tagless enqueue for %s sessions', async (_name, session) => {
        installSyncHarness({ session });

        await sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' });

        expect(mocks.sessionRpc).not.toHaveBeenCalled();
        expect(getPendingRecord().meta.capabilities).toBeUndefined();
    });

    it('surfaces when-idle preflight failure without RPC or enqueue', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        installSyncHarness({ session: null });

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('not found');

        expect(mocks.sessionRpc).not.toHaveBeenCalled();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.sendFailed');
        expect((sync as any).pendingOutbox.get('session-1')).toBeUndefined();
    });

    it('surfaces request-switch failure without enqueueing', async () => {
        mocks.sessionRpc.mockRejectedValue(new Error('rpc failed'));
        const enqueueUserMessage = vi.spyOn(sync as any, 'enqueueUserMessage');
        installSyncHarness();

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('rpc failed');

        expect(enqueueUserMessage).not.toHaveBeenCalled();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.requestSwitchFailed');
        expect((sync as any).pendingOutbox.get('session-1')).toBeUndefined();
    });

    it('does NOT call cancel-pending-switch when request-switch deferred but enqueue fails', async () => {
        mocks.sessionRpc.mockResolvedValueOnce({ deferred: true });
        installSyncHarness();
        vi.spyOn(sync as any, 'enqueueUserMessage').mockRejectedValue(new Error('enqueue failed'));

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('enqueue failed');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mocks.sessionRpc).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRpc).toHaveBeenCalledWith('request-switch', { mode: 'when-idle', messagePreview: 'hello' });
        expect(Modal.alert).toHaveBeenCalledWith('common.error', 'errors.sendFailed');
    });

    it('does not call cancel-pending-switch when request-switch was not deferred', async () => {
        mocks.sessionRpc.mockResolvedValueOnce({ deferred: false });
        installSyncHarness();
        vi.spyOn(sync as any, 'enqueueUserMessage').mockRejectedValue(new Error('enqueue failed'));

        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'when-idle' })).rejects.toThrow('enqueue failed');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mocks.sessionRpc).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRpc).toHaveBeenCalledWith('request-switch', { mode: 'when-idle', messagePreview: 'hello' });
    });

    it('now send failures do not throw to the caller (fire-and-forget)', async () => {
        installSyncHarness();
        vi.spyOn(sync as any, 'enqueueUserMessage').mockRejectedValue(new Error('enqueue failed'));

        await expect(sync.sendMessage('session-1', 'hello')).resolves.toBeUndefined();
        await expect(sync.sendMessage('session-1', 'hello', { switchMode: 'now' })).resolves.toBeUndefined();
        expect(Modal.alert).not.toHaveBeenCalled();
    });

    it('sends messagePreview truncated to 80 chars with newlines collapsed', async () => {
        mocks.sessionRpc.mockResolvedValue({ deferred: true });
        installSyncHarness();

        const long = 'a'.repeat(90);
        await sync.sendMessage('session-1', long, { switchMode: 'when-idle' });
        expect(mocks.sessionRpc).toHaveBeenCalledWith('request-switch', {
            mode: 'when-idle',
            messagePreview: 'a'.repeat(80) + '…',
        });

        mocks.sessionRpc.mockClear();
        mocks.sessionRpc.mockResolvedValue({ deferred: true });

        const multiline = 'line1\nline2\nline3';
        await sync.sendMessage('session-1', multiline, { switchMode: 'when-idle' });
        expect(mocks.sessionRpc).toHaveBeenCalledWith('request-switch', {
            mode: 'when-idle',
            messagePreview: 'line1 line2 line3',
        });
    });

    it('latches concurrent when-idle RPCs per session and clears after settlement', async () => {
        let resolveFirst!: (value: { deferred: boolean }) => void;
        mocks.sessionRpc.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
        const enqueueUserMessage = vi.spyOn(sync as any, 'enqueueUserMessage');
        installSyncHarness();

        const first = sync.sendMessage('session-1', 'first', { switchMode: 'when-idle' });
        await expect(sync.sendMessage('session-1', 'second', { switchMode: 'when-idle' })).rejects.toThrow('request-switch already pending');

        expect(mocks.sessionRpc).toHaveBeenCalledOnce();
        expect(Modal.alert).toHaveBeenCalledOnce();
        expect(enqueueUserMessage).not.toHaveBeenCalled();

        mocks.sessionRpc.mockResolvedValue({ deferred: true });
        resolveFirst({ deferred: true });
        await first;
        await sync.sendMessage('session-1', 'third', { switchMode: 'when-idle' });

        expect(mocks.sessionRpc).toHaveBeenCalledTimes(2);
    });

    it('supports upload-before-send callers without sendMessage dispatching upload RPCs', async () => {
        const order: string[] = [];
        mocks.randomUUID.mockReturnValueOnce('local-upload-id');
        mocks.sessionRpc.mockImplementation(async (method: string, params: { path?: string }) => {
            order.push(`${method}:${params.path ?? ''}`);
            return { success: true, hash: 'hash-1' };
        });
        installSyncHarness();
        vi.spyOn(sync as any, 'enqueueUserMessage');

        const localId = generateLocalMessageId();
        const remotePath = `.happy/attachments/${localId}/note.txt`;
        await sessionWriteFile('session-1', remotePath, 'bm90ZQ==', { createParents: true });
        await sync.sendMessage('session-1', `attached ${remotePath}`, {
            localId,
            attachmentRefs: [{ remotePath, name: 'note.txt', size: 4 }],
        });
        order.push('sendMessage');

        expect(localId).toBe('local-upload-id');
        expect(order).toEqual([`writeFile:${remotePath}`, 'sendMessage']);
        expect(mocks.sessionRpc).toHaveBeenCalledTimes(1);
        expect(mocks.sessionRpc).toHaveBeenCalledWith('writeFile', {
            path: remotePath,
            content: 'bm90ZQ==',
            createParents: true,
        });
        expect(getPendingRecord().meta.attachmentRefs).toEqual([{ remotePath, name: 'note.txt', size: 4 }]);
    });

    it('lets upload-before-send callers stop before sendMessage on upload failure', async () => {
        mocks.randomUUID.mockReturnValueOnce('local-upload-id');
        mocks.sessionRpc.mockRejectedValueOnce(new Error('upload failed'));
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

describe('sync settings payload limit', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
        (sync as any).credentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
        };
        mocks.storageState.settings = { theme: 'dark' };
    });

    it('rejects oversized settings before sending a tunnel request', async () => {
        mocks.storageState.settings = { large: 'x'.repeat(1024 * 1024) };

        await expect((sync as any).syncSettings()).rejects.toMatchObject({
            name: 'SettingsPayloadTooLargeError',
            limit: 1024 * 1024,
        });
        expect(mocks.tunnelFetch).not.toHaveBeenCalled();
    });

    it('maps a 413 PUT response to SettingsPayloadTooLargeError and skips the follow-up GET', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({ ok: false, status: 413 });

        await expect((sync as any).syncSettings()).rejects.toMatchObject({
            name: 'SettingsPayloadTooLargeError',
        });
        expect(mocks.tunnelFetch).toHaveBeenCalledTimes(1);
    });

    it('maps a 401 PUT response to SettingsAuthError and skips the follow-up GET', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({ ok: false, status: 401 });

        await expect((sync as any).syncSettings()).rejects.toMatchObject({
            name: 'SettingsAuthError',
            status: 401,
        });
        expect(mocks.tunnelFetch).toHaveBeenCalledTimes(1);
    });

    it('maps a 403 PUT response to SettingsAuthError and skips the follow-up GET', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({ ok: false, status: 403 });

        await expect((sync as any).syncSettings()).rejects.toMatchObject({
            name: 'SettingsAuthError',
            status: 403,
        });
        expect(mocks.tunnelFetch).toHaveBeenCalledTimes(1);
    });

    it('throws SettingsSyncError on a 5xx PUT response and skips the follow-up GET', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({ ok: false, status: 503 });

        await expect((sync as any).syncSettings()).rejects.toMatchObject({
            name: 'SettingsSyncError',
            status: 503,
        });
        expect(mocks.tunnelFetch).toHaveBeenCalledTimes(1);
    });

    it('proceeds to the follow-up GET when the PUT response is 200', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mocks.tunnelFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({}),
        });
        vi.spyOn(sync as any, 'applyServerSettings').mockImplementation(() => undefined);

        await (sync as any).syncSettings();

        expect(mocks.tunnelFetch).toHaveBeenCalledTimes(2);
        expect(mocks.tunnelFetch.mock.calls[0]?.[2]?.method).toBe('PUT');
        expect(mocks.tunnelFetch.mock.calls[1]?.[2]?.method).toBeUndefined();
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
        vi.spyOn(sync as any, 'applySessions').mockImplementation(() => undefined);
        return { metadataValue: JSON.stringify(metadata) };
    }

    it('invalidates git status when update-session metadata changes only the working directory path', async () => {
        const { metadataValue } = installUpdateHarness({ flavor: 'claude', path: '/repo/new', host: 'host' });

        await (sync as any).handleUpdate({
            id: 'update-1',
            seq: 1,
            createdAt: 100,
            body: {
                t: 'update-session',
                id: 'session-1',
                metadata: { version: 2, value: metadataValue },
            },
        });

        expect(mocks.gitStatusInvalidate).toHaveBeenCalledWith('session-1');
    });

    it('does not invalidate git status when update-session leaves agentState and metadata.path unchanged', async () => {
        const { metadataValue } = installUpdateHarness({ flavor: 'claude', path: '/repo/old', host: 'host' });

        await (sync as any).handleUpdate({
            id: 'update-1',
            seq: 1,
            createdAt: 100,
            body: {
                t: 'update-session',
                id: 'session-1',
                metadata: { version: 2, value: metadataValue },
            },
        });

        expect(mocks.gitStatusInvalidate).not.toHaveBeenCalled();
    });

    it('promotes bare parent and child refs with the in-store metadata machineId', async () => {
        const session = makeSession({
            metadata: { flavor: 'claude', path: '/repo/old', host: 'host', machineId: 'm1' },
            metadataVersion: 1,
            agentStateVersion: 1,
            agentState: { controlledByUser: true },
        });
        mocks.storageState.sessions = { 'session-1': session };
        vi.spyOn(sync as any, 'applySessions').mockImplementation(() => undefined);

        await (sync as any).handleUpdate(makeUpdate(1, {
            t: 'update-session',
            id: 'session-1',
            metadata: {
                version: 2,
                value: JSON.stringify({
                    flavor: 'claude',
                    path: '/repo/old',
                    host: 'host',
                    parentSessionId: 'parent',
                    spawnedChildren: ['child-a', 'm2:child-b'],
                }),
            },
        }));

        expect((sync as any).applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                metadata: expect.objectContaining({
                    parentSessionId: 'm1:parent',
                    spawnedChildren: ['m1:child-a', 'm2:child-b'],
                }),
            }),
        ]);
    });

    it('uses the composite session id machineId when metadata has no machineId', async () => {
        const session = makeSession({
            id: 'm1:session-1',
            metadata: { flavor: 'claude', path: '/repo/old', host: 'host' },
            metadataVersion: 1,
        });
        mocks.storageState.sessions = { 'm1:session-1': session };
        vi.spyOn(sync as any, 'applySessions').mockImplementation(() => undefined);

        await (sync as any).handleUpdate(makeUpdate(1, {
            t: 'update-session',
            id: 'm1:session-1',
            metadata: {
                version: 2,
                value: JSON.stringify({ flavor: 'claude', path: '/repo/old', host: 'host', parentSessionId: 'parent' }),
            },
        }));

        expect((sync as any).applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                metadata: expect.objectContaining({ parentSessionId: 'm1:parent' }),
            }),
        ]);
    });

    it('preserves cross-machine refs and is idempotent on re-emit', async () => {
        const session = makeSession({
            metadata: { flavor: 'claude', path: '/repo/old', host: 'host', machineId: 'm1' },
            metadataVersion: 1,
        });
        mocks.storageState.sessions = { 'session-1': session };
        vi.spyOn(sync as any, 'applySessions').mockImplementation((sessions: unknown) => {
            mocks.storageState.sessions['session-1'] = (sessions as StoredSession[])[0];
        });
        const metadata = {
            flavor: 'claude',
            path: '/repo/old',
            host: 'host',
            parentSessionId: 'm2:parent',
            spawnedChildren: ['m1:child-a', 'child-b'],
        };

        await (sync as any).handleUpdate(makeUpdate(1, {
            t: 'update-session',
            id: 'session-1',
            metadata: { version: 2, value: JSON.stringify(metadata) },
        }));
        const once = (sync as any).applySessions.mock.calls[0][0][0].metadata;

        await (sync as any).handleUpdate(makeUpdate(2, {
            t: 'update-session',
            id: 'session-1',
            metadata: { version: 3, value: JSON.stringify(once) },
        }));
        const twice = (sync as any).applySessions.mock.calls[1][0][0].metadata;

        expect(once).toEqual({
            ...metadata,
            spawnedChildren: ['m1:child-a', 'm1:child-b'],
        });
        expect(twice).toEqual(once);
    });

    it('does not crash on malformed parentSessionId or spawnedChildren shapes', async () => {
        const session = makeSession({
            metadata: { flavor: 'claude', path: '/repo/old', host: 'host', machineId: 'm1' },
            metadataVersion: 1,
        });
        mocks.storageState.sessions = { 'session-1': session };
        vi.spyOn(sync as any, 'applySessions').mockImplementation(() => undefined);

        await expect((sync as any).handleUpdate(makeUpdate(1, {
            t: 'update-session',
            id: 'session-1',
            metadata: {
                version: 2,
                value: JSON.stringify({
                    flavor: 'claude',
                    path: '/repo/old',
                    host: 'host',
                    parentSessionId: 42,
                    spawnedChildren: 'not-an-array',
                }),
            },
        }))).resolves.toBeUndefined();

        expect((sync as any).applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                metadata: expect.objectContaining({
                    parentSessionId: 42,
                    spawnedChildren: 'not-an-array',
                }),
            }),
        ]);
    });
});

describe('sync fetch-session metadata parent/child normalization', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
        (sync as any).configureMachines([{ machineId: 'm1', tunnelUrl: 'https://m1.invalid', firstSeenAt: 1 }]);
    });

    it('normalizes initial-fetch metadata and leaves composite refs unchanged', async () => {
        mocks.tunnelFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                sessions: [{
                    id: 'session-1',
                    tag: 'tag-1',
                    seq: 1,
                    metadataVersion: 1,
                    metadata: JSON.stringify({
                        flavor: 'claude',
                        path: '/repo',
                        host: 'host',
                        parentSessionId: 'parent',
                        spawnedChildren: ['child-a', 'm2:child-b'],
                    }),
                    agentState: null,
                    agentStateVersion: 1,
                    active: true,
                    activeAt: 100,
                    createdAt: 90,
                    updatedAt: 100,
                    lastMessage: null,
                }],
            }),
        });

        await (sync as any).fetchSessions();
        const storedSession = mocks.storageState.applySessions.mock.calls[0][0][0];
        const normalizedAgain = (sync as any).toCompositeSession('m1', {
            ...storedSession,
            id: 'session-1',
            metadata: storedSession.metadata,
        });

        expect(storedSession.metadata).toEqual(expect.objectContaining({
            machineId: 'm1',
            parentSessionId: 'm1:parent',
            spawnedChildren: ['m1:child-a', 'm2:child-b'],
        }));
        expect(normalizedAgain.metadata).toEqual(storedSession.metadata);
    });
});

describe('sync WS3 last-seen update seq persistence', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        resetStorageHarness();
        installWs3SyncHarness();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('persists after synchronous apply branches and after new-session invalidation resolves', async () => {
        mocks.storageState.sessions = { 'mA:session-1': makeSession({ id: 'mA:session-1' }) };
        vi.spyOn(sync as any, 'getMessagesSync').mockReturnValue({ invalidate: vi.fn() });
        vi.spyOn(sync as any, 'onSessionVisible').mockImplementation(() => undefined);

        await (sync as any).handleUpdate(makeUpdate(1, { t: 'update-session', id: 'session-1' }), false, 'mA');
        expect(mocks.storageState.lastSeenUpdateSeqByMachineId.mA).toBe(1);

        await (sync as any).handleUpdate(makePlainUpdate({
            role: 'session',
            content: { id: 'msg-2', time: 100, role: 'agent', turn: 'turn-1', ev: { t: 'turn-start' } },
        }, 2), false, 'mA');
        expect(mocks.storageState.lastSeenUpdateSeqByMachineId.mA).toBe(2);

        await (sync as any).handleUpdate(makeUpdate(3, {
            t: 'new-session',
            id: 'session-2',
            createdAt: 203,
            updatedAt: 203,
        }), false, 'mA');
        await flushPromises();

        expect((sync as any).sessionsSync.invalidateAndAwait).toHaveBeenCalledOnce();
        expect(mocks.storageState.lastSeenUpdateSeqByMachineId.mA).toBe(3);
    });

    it('defers new-session persistence until invalidateAndAwait resolves', async () => {
        let resolveInvalidate!: () => void;
        const pending = new Promise<void>(resolve => { resolveInvalidate = resolve; });
        (sync as any).sessionsSync.invalidateAndAwait.mockReturnValueOnce(pending);

        await (sync as any).handleUpdate(makeUpdate(4, {
            t: 'new-session',
            id: 'session-2',
            createdAt: 204,
            updatedAt: 204,
        }), false, 'mA');

        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();

        resolveInvalidate();
        await pending;
        await flushPromises();

        expect(mocks.storageState.setLastSeenUpdateSeq).toHaveBeenCalledWith('mA', 4);
    });

    it('does NOT persist when invalidateAndAwait resolves but session is still missing post-refetch', async () => {
        let resolveInvalidate!: () => void;
        const pending = new Promise<void>(resolve => { resolveInvalidate = resolve; });
        (sync as any).sessionsSync.invalidateAndAwait.mockReturnValueOnce(pending);

        await (sync as any).handleUpdate(makePlainUpdate({
            role: 'session',
            content: { id: 'msg-5', time: 100, role: 'agent', turn: 'turn-1', ev: { t: 'turn-start' } },
        }, 5), false, 'mA');

        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();

        resolveInvalidate();
        await pending;
        await flushPromises();

        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();
    });

    it('persists when invalidateAndAwait resolves and session IS present post-refetch', async () => {
        vi.spyOn(sync as any, 'getMessagesSync').mockReturnValue({ invalidate: vi.fn() });
        vi.spyOn(sync as any, 'onSessionVisible').mockImplementation(() => undefined);

        let resolveInvalidate!: () => void;
        const pending = new Promise<void>(resolve => { resolveInvalidate = resolve; });
        (sync as any).sessionsSync.invalidateAndAwait.mockReturnValueOnce(pending);

        await (sync as any).handleUpdate(makePlainUpdate({
            role: 'session',
            content: { id: 'msg-7', time: 100, role: 'agent', turn: 'turn-1', ev: { t: 'turn-start' } },
        }, 7), false, 'mA');

        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();

        mocks.storageState.sessions['mA:session-1'] = makeSession({ id: 'mA:session-1' });
        resolveInvalidate();
        await pending;
        await flushPromises();

        expect(mocks.storageState.setLastSeenUpdateSeq).toHaveBeenCalledWith('mA', 7);
    });

    it('does not persist invalid update payloads', async () => {
        await (sync as any).handleUpdate({ id: 'bad-update', seq: 5, createdAt: 205, body: { t: 'unknown' } }, false, 'mA');

        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();
    });

    it('persists replay-overflow currentSeq only after the fallback invalidate resolves', async () => {
        (sync as any).subscribeToUpdates();
        const handler = mocks.messageHandlers.get('replay-overflow');
        expect(handler).toBeDefined();

        handler?.({ replayOverflow: true, currentSeq: 42 }, 'mA');
        await flushPromises();

        expect((sync as any).sessionsSync.invalidateAndAwait).toHaveBeenCalledOnce();
        expect(mocks.storageState.resetLastSeenUpdateSeq).toHaveBeenCalledWith('mA', 42);
        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();

        vi.clearAllMocks();
        (sync as any).sessionsSync.invalidateAndAwait.mockRejectedValueOnce(new Error('refresh failed'));

        handler?.({ replayOverflow: true, currentSeq: 43 }, 'mA');
        await flushPromises();

        expect(mocks.storageState.resetLastSeenUpdateSeq).not.toHaveBeenCalled();
        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();
    });

    it('resets stored seq to lower currentSeq on replay-overflow after daemon restart', async () => {
        mocks.storageState.lastSeenUpdateSeqByMachineId = { mA: 500 };
        (sync as any).subscribeToUpdates();
        const handler = mocks.messageHandlers.get('replay-overflow');
        expect(handler).toBeDefined();

        handler?.({ replayOverflow: true, currentSeq: 7 }, 'mA');
        await flushPromises();

        expect(mocks.storageState.resetLastSeenUpdateSeq).toHaveBeenCalledWith('mA', 7);
        expect(mocks.storageState.lastSeenUpdateSeqByMachineId['mA']).toBe(7);
    });

    it('rejects pathological replay-overflow payloads', async () => {
        (sync as any).subscribeToUpdates();
        const handler = mocks.messageHandlers.get('replay-overflow');
        expect(handler).toBeDefined();

        const pathological: any[] = [
            { replayOverflow: true, currentSeq: Number.NaN },
            { replayOverflow: true, currentSeq: Number.POSITIVE_INFINITY },
            { replayOverflow: true, currentSeq: Number.NEGATIVE_INFINITY },
            { replayOverflow: true, currentSeq: -1 },
            { replayOverflow: true, currentSeq: 1.5 },
            { replayOverflow: true, currentSeq: '42' },
            { replayOverflow: true },
            { currentSeq: 42 },
            { replayOverflow: false, currentSeq: 42 },
            null,
            undefined,
        ];

        for (const payload of pathological) {
            handler?.(payload, 'mA');
        }
        await flushPromises();

        expect((sync as any).sessionsSync.invalidateAndAwait).not.toHaveBeenCalled();
        expect(mocks.storageState.resetLastSeenUpdateSeq).not.toHaveBeenCalled();
        expect(mocks.storageState.setLastSeenUpdateSeq).not.toHaveBeenCalled();
    });

    it('invalidates sessions on first reconnect when no last-seen seq exists', () => {
        const { sessionsSync, machinesSync } = installWs3SyncHarness();
        (sync as any).subscribeToUpdates();

        mocks.reconnectedListeners[0]?.('mA');

        expect(machinesSync.invalidate).toHaveBeenCalledOnce();
        expect(sessionsSync.invalidate).toHaveBeenCalledOnce();
    });

    it('skips sessions invalidation on resume reconnect when a finite last-seen seq exists', () => {
        const { sessionsSync, machinesSync } = installWs3SyncHarness();
        mocks.storageState.lastSeenUpdateSeqByMachineId = { mA: 42 };
        (sync as any).subscribeToUpdates();

        mocks.reconnectedListeners[0]?.('mA');

        expect(machinesSync.invalidate).toHaveBeenCalledOnce();
        expect(sessionsSync.invalidate).not.toHaveBeenCalled();
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

        await (sync as any).handleUpdate(makePlainUpdate({
            role: 'session',
            content: {
                id: 'env-start',
                time: 100,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-start' },
            },
        }));

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

        await (sync as any).handleUpdate(makePlainUpdate({
            role: 'session',
            content: {
                id: 'env-end',
                time: 100,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-end', status: 'completed' },
            },
        }));

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
        ].sort());
    }, 30_000);
});
