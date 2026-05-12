import { describe, expect, it } from 'vitest';
import { AgentStateSchema, MetadataSchema } from './storageTypes';

describe('MetadataSchema', () => {
    it('preserves archive lifecycle metadata', () => {
        const metadata = MetadataSchema.parse({
            path: '/tmp/project',
            host: 'local-machine',
            startedBy: 'daemon',
            startedFromDaemon: true,
            lifecycleState: 'archived',
            lifecycleStateSince: 123,
            archivedBy: 'cli',
            archiveReason: 'User terminated',
        });

        expect(metadata.startedBy).toBe('daemon');
        expect(metadata.startedFromDaemon).toBe(true);
        expect(metadata.lifecycleState).toBe('archived');
        expect(metadata.lifecycleStateSince).toBe(123);
        expect(metadata.archivedBy).toBe('cli');
        expect(metadata.archiveReason).toBe('User terminated');
    });

    it('preserves richer SDK init metadata', () => {
        const expectedMetadata = {
            path: '/tmp/project',
            host: 'local-machine',
            skills: ['plan', 'ship'],
            agents: ['explorer', 'worker'],
            plugins: [
                { name: 'ralph-orchestration', path: '/Users/dev/.claude/plugins/ralph', source: 'marketplace' },
                { name: 'code-review', path: 'C:\\Users\\dev\\.claude\\plugins\\review' },
            ],
            outputStyle: 'concise',
            mcpServers: {
                filesystem: { transport: 'stdio' },
                github: { transport: 'http', url: 'https://example.test/mcp' },
            },
        };
        const metadata = MetadataSchema.parse(expectedMetadata);

        expect(metadata).toEqual(expectedMetadata);
    });

    it('parses plugin source when present and leaves it absent when omitted', () => {
        const metadata = MetadataSchema.parse({
            path: '/tmp/project',
            host: 'local-machine',
            plugins: [
                { name: 'market-plugin', path: '/plugins/market-plugin', source: 'marketplace' },
                { name: 'local-plugin', path: '/plugins/local-plugin' },
            ],
        });

        expect(metadata.plugins).toEqual([
            { name: 'market-plugin', path: '/plugins/market-plugin', source: 'marketplace' },
            { name: 'local-plugin', path: '/plugins/local-plugin' },
        ]);
        expect(metadata.plugins?.[1]).not.toHaveProperty('source');
    });

    it('preserves latest context boundary', () => {
        const expectedMetadata = {
            path: '/tmp/project',
            host: 'local-machine',
            latestBoundary: {
                id: 'boundary-1',
                kind: 'session-fork-resume' as const,
                seq: 42,
                at: 1710000000000,
                forkedFromSid: 'previous-session',
            },
        };
        const metadata = MetadataSchema.parse(expectedMetadata);

        expect(metadata?.latestBoundary).toEqual(expectedMetadata.latestBoundary);
    });

    it('parses current permission mode and strips unknown metadata fields', () => {
        const metadata = MetadataSchema.parse({
            path: '/tmp/project',
            host: 'local-machine',
            currentOperatingModeCode: 'build',
            currentPermissionModeCode: 'bypassPermissions',
            futureCliField: 'ignored by older apps',
        });

        expect(metadata.currentPermissionModeCode).toBe('bypassPermissions');
        expect(metadata).not.toHaveProperty('futureCliField');
    });
});

describe('AgentStateSchema', () => {
    it('parses deferred-switch state from new CLIs and tolerates missing fields from legacy CLIs', () => {
        const legacyState = AgentStateSchema.parse({});
        const newState = AgentStateSchema.parse({
            controlledByUser: true,
            pendingSwitch: {
                requestedAt: 1710000000000,
                messagePreview: 'please take over later',
            },
            turnActive: true,
        });

        expect(legacyState.pendingSwitch).toBeUndefined();
        expect(legacyState.turnActive).toBeUndefined();
        expect(newState.pendingSwitch).toEqual({
            requestedAt: 1710000000000,
            messagePreview: 'please take over later',
        });
        expect(newState.turnActive).toBe(true);
    });
});
