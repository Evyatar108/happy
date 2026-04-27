import { describe, expect, it, vi } from 'vitest';
import { maybeIntercept } from '@/sync/slashCommandIntercept';
import type { PreSendCommandResult } from '@/hooks/usePreSendCommand';

// Simulates the handleSend callback in new/index.tsx: trims the prompt, calls
// preSendCommand, and short-circuits before machineSpawnNewSession when intercepted.
async function buildHandleSend(
    prompt: string,
    preSendCommand: (cmd: string) => PreSendCommandResult,
    machineSpawnNewSession: () => Promise<void>,
) {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt) {
        const intercept = preSendCommand(trimmedPrompt);
        if (intercept.intercepted) {
            intercept.execute();
            return;
        }
    }

    await machineSpawnNewSession();
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
