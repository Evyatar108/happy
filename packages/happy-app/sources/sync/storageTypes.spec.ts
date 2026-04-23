import { describe, expect, it } from 'vitest';
import { EncryptionCache } from './encryption/encryptionCache';
import { SessionEncryption } from './encryption/sessionEncryption';
import { MetadataSchema } from './storageTypes';

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

    it('preserves richer SDK init metadata through sessionEncryption.safeParse', async () => {
        const expectedMetadata = {
            path: '/tmp/project',
            host: 'local-machine',
            skills: ['plan', 'ship'],
            agents: ['explorer', 'worker'],
            plugins: [
                { name: 'ralph-orchestration', path: '/Users/dev/.claude/plugins/ralph' },
                { name: 'code-review', path: 'C:\\Users\\dev\\.claude\\plugins\\review' },
            ],
            outputStyle: 'concise',
            mcpServers: {
                filesystem: { transport: 'stdio' },
                github: { transport: 'http', url: 'https://example.test/mcp' },
            },
        };
        const sessionEncryption = new SessionEncryption(
            'session-1',
            {
                encrypt: async () => [new Uint8Array([0])],
                decrypt: async () => [expectedMetadata],
            },
            new EncryptionCache(),
        );

        const metadata = await sessionEncryption.decryptMetadata(1, 'AA==');

        expect(metadata).toEqual(expectedMetadata);
    });
});
