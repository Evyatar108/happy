import { describe, expect, it, vi } from 'vitest';
import { maybeIntercept } from '@/sync/slashCommandIntercept';
import type { PreSendCommandResult } from '@/hooks/usePreSendCommand';
import { shouldShowBoundaryAdvisory, updateComposeStartAt } from './composeBoundaryAdvisory';
import type { LatestBoundary } from '@/sync/reducer/reducer';

// Simulates the onSend callback in SessionView: trims the message, calls
// preSendCommand, and short-circuits before sync.sendMessage when intercepted.
function buildOnSend(
    message: string,
    preSendCommand: (cmd: string) => PreSendCommandResult,
    sendMessage: (sessionId: string, msg: string, opts: object) => void,
    sessionId: string,
) {
    return () => {
        const trimmedMessage = message.trim();
        if (trimmedMessage) {
            const intercept = preSendCommand(trimmedMessage);
            if (intercept.intercepted) {
                intercept.execute();
                return;
            }

            sendMessage(sessionId, message, { source: 'chat' });
        }
    };
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

describe('SessionView onSend intercept guard', () => {
    it('does NOT call sync.sendMessage when a synthetic command is intercepted', () => {
        const sendMessage = vi.fn();
        const mockExecute = vi.fn();
        const preSendCommand = (_command: string): PreSendCommandResult => ({
            intercepted: true,
            execute: mockExecute,
        });

        const onSend = buildOnSend('/skills', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(sendMessage).not.toHaveBeenCalled();
        expect(mockExecute).toHaveBeenCalledOnce();
    });

    it('DOES call sync.sendMessage when the command is not intercepted', () => {
        const sendMessage = vi.fn();
        const preSendCommand = makePreSendCommand('session-1');

        const onSend = buildOnSend('write a test', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith('session-1', 'write a test', { source: 'chat' });
    });

    it('does NOT call sync.sendMessage for any session-scoped synthetic command', () => {
        for (const cmd of ['/plugin', '/skills', '/agents']) {
            const sendMessage = vi.fn();
            const preSendCommand = makePreSendCommand('session-1');

            const onSend = buildOnSend(cmd, preSendCommand, sendMessage, 'session-1');
            onSend();

            expect(sendMessage).not.toHaveBeenCalled();
        }
    });

    it('does NOT call sync.sendMessage when /rename is entered in a live session', () => {
        const sendMessage = vi.fn();
        const preSendCommand = makePreSendCommand('session-1');

        const onSend = buildOnSend('/rename Foo', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT call sync.sendMessage when /rename is entered without a name', () => {
        const sendMessage = vi.fn();
        const preSendCommand = makePreSendCommand('session-1');

        const onSend = buildOnSend('/rename   ', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT call sync.sendMessage for terminal-only synthetic commands', () => {
        for (const cmd of ['/memory', '/model', '/mcp', '/help']) {
            const sendMessage = vi.fn();
            const preSendCommand = makePreSendCommand('session-1');

            const onSend = buildOnSend(cmd, preSendCommand, sendMessage, 'session-1');
            onSend();

            expect(sendMessage).not.toHaveBeenCalled();
        }
    });

    it('skips the intercept entirely when the message is whitespace-only', () => {
        const sendMessage = vi.fn();
        const preSendCommand = vi.fn((): PreSendCommandResult => ({ intercepted: false, execute: () => {} }));

        const onSend = buildOnSend('   ', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(preSendCommand).not.toHaveBeenCalled();
        expect(sendMessage).not.toHaveBeenCalled();
    });
});

describe('SessionView cross-device boundary advisory', () => {
    const boundary: LatestBoundary = {
        id: 'boundary-1',
        kind: 'clear',
        seq: 10,
        at: 1_500,
    };

    it('records compose start on empty-to-non-empty transition and clears it when emptied', () => {
        const startedAt = updateComposeStartAt(null, '', 'draft', 1_000);

        expect(startedAt).toBe(1_000);
        expect(updateComposeStartAt(startedAt, 'draft', 'draft more', 1_100)).toBe(1_000);
        expect(updateComposeStartAt(startedAt, 'draft', '', 1_200)).toBeNull();
    });

    it('shows advisory when a boundary arrives after compose started without blocking send', () => {
        const composeStartAt = updateComposeStartAt(null, '', 'draft', 1_000);
        const sendMessage = vi.fn();
        const preSendCommand = makePreSendCommand('session-1');

        expect(shouldShowBoundaryAdvisory(boundary, composeStartAt)).toBe(true);

        const onSend = buildOnSend('draft', preSendCommand, sendMessage, 'session-1');
        onSend();

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith('session-1', 'draft', { source: 'chat' });
    });

    it('does not show advisory for boundaries older than compose start', () => {
        expect(shouldShowBoundaryAdvisory(boundary, 2_000)).toBe(false);
    });
});
