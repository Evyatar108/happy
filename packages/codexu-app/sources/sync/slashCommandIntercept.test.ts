import { describe, expect, it } from 'vitest';
import { maybeIntercept } from './slashCommandIntercept';

const SESSION_ROUTE_CASES = [
    ['plugin', '/session/abc/plugins', 'pluginRequiresSession'],
    ['skills', '/session/abc/skills', 'skillsRequiresSession'],
    ['agents', '/session/abc/agents', 'agentsRequiresSession'],
] as const;

const TERMINAL_ONLY_CASES = [
    ['memory', 'memoryTerminalOnly'],
    ['model', 'modelTerminalOnly'],
    ['mcp', 'mcpTerminalOnly'],
    ['help', 'helpTerminalOnly'],
] as const;

describe('maybeIntercept', () => {
    it('routes each session-scoped synthetic command when a live session exists', () => {
        for (const [command, path] of SESSION_ROUTE_CASES) {
            expect(maybeIntercept(`/${command}`, 'abc')).toEqual({
                type: 'route',
                path,
            });
        }
    });

    it('falls back to alerts before session creation for each session-scoped synthetic command', () => {
        for (const [command, , messageKey] of SESSION_ROUTE_CASES) {
            expect(maybeIntercept(`/${command}`, undefined)).toEqual({
                type: 'alert',
                messageKey,
            });
        }
    });

    it('shows terminal-only alerts for the remaining synthetic commands with or without a session', () => {
        for (const [command, messageKey] of TERMINAL_ONLY_CASES) {
            expect(maybeIntercept(`/${command}`, 'abc')).toEqual({
                type: 'alert',
                messageKey,
            });
            expect(maybeIntercept(`/${command}`, undefined)).toEqual({
                type: 'alert',
                messageKey,
            });
        }
    });

    it('falls back to alerts when the sessionId contains routing control characters', () => {
        for (const [command, , messageKey] of SESSION_ROUTE_CASES) {
            expect(maybeIntercept(`/${command}`, 'abc/../evil')).toEqual({
                type: 'alert',
                messageKey,
            });
            expect(maybeIntercept(`/${command}`, '')).toEqual({
                type: 'alert',
                messageKey,
            });
        }
    });

    it('parses slash commands even when the user includes trailing arguments', () => {
        expect(maybeIntercept('/help routing details', 'abc')).toEqual({
            type: 'alert',
            messageKey: 'helpTerminalOnly',
        });
    });

    it('returns a rename action for /rename with a non-empty name in a live session', () => {
        expect(maybeIntercept('/rename   Foo Bar  ', 'abc')).toEqual({
            type: 'rename',
            name: 'Foo Bar',
        });
    });

    it('returns an alert for /rename with no argument in a live session', () => {
        expect(maybeIntercept('/rename', 'abc')).toEqual({
            type: 'alert',
            messageKey: 'renameEmptyName',
        });
    });

    it('returns an alert for /rename with a whitespace-only argument in a live session', () => {
        expect(maybeIntercept('/rename    ', 'abc')).toEqual({
            type: 'alert',
            messageKey: 'renameEmptyName',
        });
    });

    it('does not intercept /rename before a session exists', () => {
        expect(maybeIntercept('/rename Foo', undefined)).toBeNull();
    });

    it('passes through non-intercepted commands', () => {
        expect(maybeIntercept('/clear', 'abc')).toBeNull();
        expect(maybeIntercept('write a test', 'abc')).toBeNull();
    });
});
