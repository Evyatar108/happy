import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState, Metadata, Session } from '@/api/types';
import { publishPermissionModeIfChanged } from './publishPermissionMode';
import { setupOfflineReconnection } from './setupOfflineReconnection';

const mocks = vi.hoisted(() => ({
    mockStartOfflineReconnection: vi.fn(),
}));

vi.mock('@/utils/serverConnectionErrors', () => ({
    startOfflineReconnection: mocks.mockStartOfflineReconnection,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createMetadata(): Metadata {
    return {
        path: '/workspace',
        host: 'test-host',
        homeDir: '/home/test',
        happyHomeDir: '/home/test/.happy',
        happyLibDir: '/home/test/.happy/lib',
        happyToolsDir: '/home/test/.happy/tools',
        currentPermissionModeCode: 'default',
    };
}

function createSession(id: string): Session {
    return {
        id,
        metadata: createMetadata(),
        metadataVersion: 1,
        agentState: {},
        agentStateVersion: 1,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
    } as Session;
}

describe('setupOfflineReconnection permission mode metadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockStartOfflineReconnection.mockReturnValue({ cancel: vi.fn() });
    });

    it('reuses the live metadata object updated by permission-mode publishing across reconnects', async () => {
        const metadata = createMetadata();
        const state: AgentState = {};
        const recordedModes: Array<string | undefined> = [];
        const api = {
            getOrCreateSession: vi.fn(async ({ metadata }: { metadata: Metadata }) => {
                recordedModes.push(metadata.currentPermissionModeCode);
                return createSession(`session-${recordedModes.length}`);
            }),
            sessionSyncClient: vi.fn((session: Session) => ({ sessionId: session.id })),
        } as any;

        setupOfflineReconnection({
            api,
            sessionTag: 'tag-1',
            metadata,
            state,
            response: null,
            onSessionSwap: vi.fn(),
        });

        const reconnectOptions = mocks.mockStartOfflineReconnection.mock.calls[0][0];

        await reconnectOptions.onReconnected();
        expect(recordedModes).toEqual(['default']);

        await publishPermissionModeIfChanged(
            { updateMetadata: vi.fn(async () => {}) },
            metadata,
            'bypassPermissions',
            { current: 'default' },
        );

        await reconnectOptions.onReconnected();
        expect(recordedModes).toEqual(['default', 'bypassPermissions']);
    });
});
