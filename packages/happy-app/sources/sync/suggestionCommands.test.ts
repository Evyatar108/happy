import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metadata, Session } from './storageTypes';

const TEST_SESSION_ID = 'session-under-test';
const state = vi.hoisted(() => ({
    sessions: {} as Record<string, Session>,
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({
            sessions: state.sessions,
        }),
    },
}));

const { getAllCommands, searchCommands } = await import('./suggestionCommands');

function createSession(metadata?: Metadata | null): Session {
    return {
        id: TEST_SESSION_ID,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: metadata ?? null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
    };
}

function setSessionMetadata(metadata?: Metadata | null): void {
    state.sessions = {
        [TEST_SESSION_ID]: createSession(metadata),
    };
}

afterEach(() => {
    state.sessions = {};
});

describe('suggestionCommands', () => {
    it('returns defaults, synthetic app commands, and all slashCommands for an empty query', async () => {
        setSessionMetadata({
            path: '/repo',
            host: 'workstation',
            slashCommands: ['init', 'context', 'custom-skill', 'acme-plugin:deploy'],
            skills: ['custom-skill'],
            agents: ['helper'],
            plugins: [{ name: 'acme-plugin', path: '/plugins/acme-plugin' }],
        });

        const commands = await searchCommands(TEST_SESSION_ID, '');

        expect(commands).toEqual([
            expect.objectContaining({ command: 'clear', source: 'native-local' }),
            expect.objectContaining({ command: 'compact', source: 'native-local' }),
            expect.objectContaining({ command: 'plugin', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'skills', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'agents', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'memory', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'model', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'mcp', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'help', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'rename', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'init', source: 'native-prompt' }),
            expect.objectContaining({ command: 'context', source: 'native-local' }),
            expect.objectContaining({ command: 'custom-skill', source: 'skill' }),
            expect.objectContaining({ command: 'acme-plugin:deploy', source: 'plugin' }),
        ]);
    });

    it('treats colon-prefixed commands as plugins only when the prefix matches a loaded plugin', () => {
        setSessionMetadata({
            path: '/repo',
            host: 'workstation',
            slashCommands: ['acme-plugin:deploy', 'unknown-plugin:deploy'],
            plugins: [{ name: 'acme-plugin', path: '/plugins/acme-plugin' }],
        });

        const commands = getAllCommands(TEST_SESSION_ID);

        expect(commands).toContainEqual(expect.objectContaining({
            command: 'acme-plugin:deploy',
            source: 'plugin',
        }));
        expect(commands).toContainEqual(expect.objectContaining({
            command: 'unknown-plugin:deploy',
            source: 'native-local',
        }));
    });

    it('keeps Fuse ranking stable across prompt, skill, and plugin commands', async () => {
        setSessionMetadata({
            path: '/repo',
            host: 'workstation',
            slashCommands: ['review', 'review-checklist', 'acme-plugin:review'],
            skills: ['review-checklist'],
            plugins: [{ name: 'acme-plugin', path: '/plugins/acme-plugin' }],
        });

        const commands = await searchCommands(TEST_SESSION_ID, 'review');

        expect(commands[0]).toEqual(expect.objectContaining({
            command: 'review',
            source: 'native-prompt',
        }));
        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({ command: 'review-checklist', source: 'skill' }),
            expect.objectContaining({ command: 'acme-plugin:review', source: 'plugin' }),
        ]));
    });

    it('classifies commit and commit-push-pr as native-prompt', () => {
        setSessionMetadata({
            path: '/repo',
            host: 'workstation',
            slashCommands: ['commit', 'commit-push-pr'],
        });

        const commands = getAllCommands(TEST_SESSION_ID);

        expect(commands).toContainEqual(expect.objectContaining({
            command: 'commit',
            source: 'native-prompt',
        }));
        expect(commands).toContainEqual(expect.objectContaining({
            command: 'commit-push-pr',
            source: 'native-prompt',
        }));
    });

    it('falls back to defaults plus synthetic app commands when session metadata is missing', async () => {
        state.sessions = {};

        await expect(searchCommands('missing-session', '')).resolves.toEqual([
            expect.objectContaining({ command: 'clear', source: 'native-local' }),
            expect.objectContaining({ command: 'compact', source: 'native-local' }),
            expect.objectContaining({ command: 'plugin', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'skills', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'agents', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'memory', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'model', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'mcp', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'help', source: 'app-synthetic' }),
            expect.objectContaining({ command: 'rename', source: 'app-synthetic' }),
        ]);
    });
});
