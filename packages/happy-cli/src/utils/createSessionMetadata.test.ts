import { afterEach, describe, expect, it } from 'vitest';
import type { SandboxConfig } from '@/persistence';
import { createSessionMetadata } from './createSessionMetadata';

const metadataEnvKeys = [
    'HAPPY_PROJECT_PATH',
    'HAPPY_WORKTREE_PATH',
    'HAPPY_SPAWN_RUN_ID',
] as const;

const originalMetadataEnv = Object.fromEntries(
    metadataEnvKeys.map((key) => [key, process.env[key]])
) as Record<typeof metadataEnvKeys[number], string | undefined>;

function createSandboxConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
    return {
        enabled: true,
        workspaceRoot: '~/Developer',
        sessionIsolation: 'workspace',
        customWritePaths: [],
        denyReadPaths: ['~/.ssh', '~/.aws', '~/.gnupg'],
        extraWritePaths: ['/tmp'],
        denyWritePaths: ['.env'],
        networkMode: 'allowed',
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: true,
        ...overrides,
    };
}

describe('createSessionMetadata', () => {
    afterEach(() => {
        for (const key of metadataEnvKeys) {
            if (originalMetadataEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalMetadataEnv[key];
            }
        }
    });

    it('sets metadata.sandbox to the config when enabled', () => {
        const sandbox = createSandboxConfig();
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-1',
            startedBy: 'terminal',
            sandbox,
        });

        expect(metadata.sandbox).toEqual(sandbox);
    });

    it('sets metadata.sandbox to null when sandbox is disabled', () => {
        const sandbox = createSandboxConfig({ enabled: false });
        const { metadata } = createSessionMetadata({
            flavor: 'gemini',
            machineId: 'machine-2',
            startedBy: 'daemon',
            sandbox,
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.sandbox to null when sandbox is not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-3',
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions to null when not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-4',
        });

        expect(metadata.dangerouslySkipPermissions).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions when provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-5',
            dangerouslySkipPermissions: true,
        });

        expect(metadata.dangerouslySkipPermissions).toBe(true);
    });

    it('passes fan-out metadata env vars through to session metadata', () => {
        process.env.HAPPY_PROJECT_PATH = '/repo/root';
        process.env.HAPPY_WORKTREE_PATH = '/repo/root/.dev/worktree/ralph-12345678';
        process.env.HAPPY_SPAWN_RUN_ID = 'run-123';

        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-6',
        });

        expect(metadata).toMatchObject({
            projectPath: '/repo/root',
            worktreePath: '/repo/root/.dev/worktree/ralph-12345678',
            runId: 'run-123',
            flavor: 'codex',
        });
    });
});
