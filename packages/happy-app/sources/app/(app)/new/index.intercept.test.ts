import { describe, expect, it, vi } from 'vitest';
import { maybeIntercept } from '@/sync/slashCommandIntercept';
import type { PreSendCommandResult } from '@/hooks/usePreSendCommand';
import type { SpawnSessionOptions } from '@/sync/ops';

type StagedAttachment = { encodedBytes: number };

const MAX_ENCODED_ATTACHMENT_BYTES = 4 * 1024 * 1024;

// Simulates the handleSend callback in new/index.tsx: trims the prompt, calls
// preSendCommand, and short-circuits before machineSpawnNewSession when intercepted.
async function buildHandleSend(
    prompt: string,
    preSendCommand: (cmd: string) => PreSendCommandResult,
    machineSpawnNewSession: () => Promise<void>,
    stagedAttachments: StagedAttachment[] = [],
    modalAlert: (title: string, msg: string) => void = () => {},
) {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt) {
        const intercept = preSendCommand(trimmedPrompt);
        if (intercept.intercepted) {
            intercept.execute();
            return;
        }
    }

    if (stagedAttachments.some((a) => a.encodedBytes > MAX_ENCODED_ATTACHMENT_BYTES)) {
        modalAlert('common.error', 'errors.attachmentTooLarge');
        return;
    }

    await machineSpawnNewSession();
}

// Simulates the target resolution and machineSpawnNewSession call in new/index.tsx,
// parameterised by the session target tuple (machineId, selectedPath, worktreeKey).
async function buildHandleSpawnWithTarget(
    target: {
        machineId: string;
        selectedPath: string;
        worktreeKey: string;
        selectedAgent: SpawnSessionOptions['agent'];
    },
    machineSpawnNewSession: (opts: SpawnSessionOptions) => Promise<void>,
) {
    const pathToUse = target.selectedPath.trim() || '~';
    let spawnDirectory = pathToUse;
    if (target.worktreeKey !== '__none__' && target.worktreeKey !== '__new__') {
        spawnDirectory = target.worktreeKey;
    }
    await machineSpawnNewSession({
        machineId: target.machineId,
        directory: spawnDirectory,
        agent: target.selectedAgent,
    });
}

function makePreSendCommand(sessionId: string | undefined) {
    return (command: string): PreSendCommandResult => {
        const result = maybeIntercept(command, sessionId);
        if (!result) {
            return { intercepted: false, execute: () => {} };
        }
        return {
            intercepted: true,
            execute: vi.fn(),
        };
    };
}

describe('new/index.tsx handleSend target-switching safeguard', () => {
    it('calls machineSpawnNewSession with the displayed machineId when selectedMachineId changes', async () => {
        const spawn = vi.fn().mockResolvedValue(undefined);

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/project', worktreeKey: '__none__', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-A' }));

        spawn.mockClear();

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-B', selectedPath: '/home/user/project', worktreeKey: '__none__', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-B' }));
    });

    it('calls machineSpawnNewSession with the displayed path when selectedPath changes', async () => {
        const spawn = vi.fn().mockResolvedValue(undefined);

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/alpha', worktreeKey: '__none__', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ directory: '/home/user/alpha' }));

        spawn.mockClear();

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/beta', worktreeKey: '__none__', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ directory: '/home/user/beta' }));
    });

    it('calls machineSpawnNewSession with the worktree path when a specific worktreeKey is selected', async () => {
        const spawn = vi.fn().mockResolvedValue(undefined);

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/repo', worktreeKey: '/home/user/repo/.git/worktrees/feature', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-A',
            directory: '/home/user/repo/.git/worktrees/feature',
        }));
    });

    it('calls machineSpawnNewSession with the base path when worktreeKey switches back to __none__', async () => {
        const spawn = vi.fn().mockResolvedValue(undefined);

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/repo', worktreeKey: '__none__', selectedAgent: 'claude' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ directory: '/home/user/repo' }));
    });

    it('passes the displayed agent to machineSpawnNewSession', async () => {
        const spawn = vi.fn().mockResolvedValue(undefined);

        await buildHandleSpawnWithTarget(
            { machineId: 'machine-A', selectedPath: '/home/user/project', worktreeKey: '__none__', selectedAgent: 'codex' },
            spawn,
        );
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ agent: 'codex' }));
    });
});

describe('new/index.tsx handleSend intercept guard', () => {
    it('does NOT call machineSpawnNewSession when a synthetic command is intercepted', async () => {
        const spawnSession = vi.fn();
        const mockExecute = vi.fn();
        const preSendCommand = (_command: string): PreSendCommandResult => ({
            intercepted: true,
            execute: mockExecute,
        });

        await buildHandleSend('/skills', preSendCommand, spawnSession);

        expect(spawnSession).not.toHaveBeenCalled();
        expect(mockExecute).toHaveBeenCalledOnce();
    });

    it('DOES call machineSpawnNewSession when the command is not intercepted', async () => {
        const spawnSession = vi.fn().mockResolvedValue(undefined);
        const preSendCommand = makePreSendCommand(undefined);

        await buildHandleSend('start new project', preSendCommand, spawnSession);

        expect(spawnSession).toHaveBeenCalledOnce();
    });

    it('does NOT call machineSpawnNewSession for any session-scoped synthetic command (no live session)', async () => {
        // On the new-session screen there is no sessionId yet; these commands
        // should still be intercepted and show an alert rather than spawning.
        for (const cmd of ['/plugin', '/skills', '/agents']) {
            const spawnSession = vi.fn();
            const preSendCommand = makePreSendCommand(undefined);

            await buildHandleSend(cmd, preSendCommand, spawnSession);

            expect(spawnSession).not.toHaveBeenCalled();
        }
    });

    it('falls through to machineSpawnNewSession when /rename is entered before a session exists', async () => {
        const spawnSession = vi.fn().mockResolvedValue(undefined);
        const preSendCommand = makePreSendCommand(undefined);

        await buildHandleSend('/rename Foo', preSendCommand, spawnSession);

        expect(spawnSession).toHaveBeenCalledOnce();
    });

    it('does NOT call machineSpawnNewSession for terminal-only synthetic commands', async () => {
        for (const cmd of ['/memory', '/model', '/mcp', '/help']) {
            const spawnSession = vi.fn();
            const preSendCommand = makePreSendCommand(undefined);

            await buildHandleSend(cmd, preSendCommand, spawnSession);

            expect(spawnSession).not.toHaveBeenCalled();
        }
    });

    it('still calls machineSpawnNewSession when the prompt is a regular slash command', async () => {
        const spawnSession = vi.fn().mockResolvedValue(undefined);
        const preSendCommand = makePreSendCommand(undefined);

        await buildHandleSend('/clear', preSendCommand, spawnSession);

        expect(spawnSession).toHaveBeenCalledOnce();
    });

    it('calls machineSpawnNewSession when the prompt is whitespace-only (no intercept attempted)', async () => {
        const spawnSession = vi.fn().mockResolvedValue(undefined);
        const preSendCommand = vi.fn((): PreSendCommandResult => ({ intercepted: false, execute: () => {} }));

        await buildHandleSend('   ', preSendCommand, spawnSession);

        expect(preSendCommand).not.toHaveBeenCalled();
        expect(spawnSession).toHaveBeenCalledOnce();
    });
});

describe('new/index.tsx handleSend oversize attachment guard', () => {
    it('does NOT call machineSpawnNewSession when a staged attachment exceeds 4 MB', async () => {
        const spawnSession = vi.fn();
        const modalAlert = vi.fn();
        const preSendCommand = makePreSendCommand(undefined);
        const oversizedAttachment: StagedAttachment = { encodedBytes: 4 * 1024 * 1024 + 1 };

        await buildHandleSend('hello', preSendCommand, spawnSession, [oversizedAttachment], modalAlert);

        expect(spawnSession).not.toHaveBeenCalled();
        expect(modalAlert).toHaveBeenCalledWith('common.error', 'errors.attachmentTooLarge');
    });

    it('DOES call machineSpawnNewSession when all staged attachments are within the 4 MB limit', async () => {
        const spawnSession = vi.fn().mockResolvedValue(undefined);
        const modalAlert = vi.fn();
        const preSendCommand = makePreSendCommand(undefined);
        const okAttachment: StagedAttachment = { encodedBytes: 4 * 1024 * 1024 };

        await buildHandleSend('hello', preSendCommand, spawnSession, [okAttachment], modalAlert);

        expect(spawnSession).toHaveBeenCalledOnce();
        expect(modalAlert).not.toHaveBeenCalled();
    });
});
