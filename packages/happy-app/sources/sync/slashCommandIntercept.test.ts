import { describe, expect, it } from 'vitest';
import { maybeIntercept } from './slashCommandIntercept';

describe('maybeIntercept', () => {
    it('routes session-scoped commands when a live session exists', () => {
        expect(maybeIntercept('/plugin', 'session-123')).toEqual({
            type: 'route',
            path: '/session/session-123/plugins',
        });
    });

    it('falls back to an alert before session creation when a route needs a session id', () => {
        expect(maybeIntercept('/plugin', undefined)).toEqual({
            type: 'alert',
            messageKey: 'pluginRequiresSession',
        });
    });

    it('passes through non-intercepted commands', () => {
        expect(maybeIntercept('/clear', 'session-123')).toBeNull();
        expect(maybeIntercept('write a test', 'session-123')).toBeNull();
    });
});
