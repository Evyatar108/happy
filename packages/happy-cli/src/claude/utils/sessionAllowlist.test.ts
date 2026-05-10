import { describe, it, expect } from 'vitest';
import { SessionAllowlist } from './sessionAllowlist';

describe('SessionAllowlist.rehydrateFromAgentState', () => {
    it('adds entries from agentState without removing in-flight local approvals', () => {
        const allowlist = new SessionAllowlist();

        allowlist.applyPermissionResponse(
            {
                approved: true,
                decision: 'approved_for_session',
                allowTools: ['Bash(npm test)'],
            },
        );

        expect(allowlist.isAllowed('Bash', { command: 'npm test' })).toBe(true);

        allowlist.rehydrateFromAgentState({
            completedRequests: {
                'stale-approval': {
                    tool: 'Write',
                    arguments: { file_path: '/tmp/a', content: 'x' },
                    createdAt: 1,
                    completedAt: 2,
                    status: 'approved',
                    decision: 'approved_for_session',
                    allowTools: ['Write'],
                },
            },
        });

        expect(allowlist.isAllowed('Bash', { command: 'npm test' })).toBe(true);
        expect(allowlist.isAllowed('Write', { file_path: '/tmp/a', content: 'x' })).toBe(true);
    });

    it('applies entries from agentState when allowlist is empty', () => {
        const allowlist = new SessionAllowlist();

        allowlist.rehydrateFromAgentState({
            completedRequests: {
                'prev-bash': {
                    tool: 'Bash',
                    arguments: { command: 'ls' },
                    createdAt: 1,
                    completedAt: 2,
                    status: 'approved',
                    decision: 'approved_for_session',
                    allowTools: ['Bash(ls)'],
                },
            },
        });

        expect(allowlist.isAllowed('Bash', { command: 'ls' })).toBe(true);
        expect(allowlist.isAllowed('Bash', { command: 'rm -rf /' })).toBe(false);
    });

    it('is idempotent when called twice with the same agentState', () => {
        const allowlist = new SessionAllowlist();
        const agentState = {
            completedRequests: {
                'edit-approval': {
                    tool: 'Edit',
                    arguments: { file_path: '/tmp/b', old_string: 'a', new_string: 'b' },
                    createdAt: 1,
                    completedAt: 2,
                    status: 'approved' as const,
                    decision: 'approved_for_session' as const,
                    mode: 'acceptEdits' as const,
                },
            },
        };

        allowlist.rehydrateFromAgentState(agentState);
        allowlist.rehydrateFromAgentState(agentState);

        const tool = 'Edit';
        const input = { file_path: '/tmp/b', old_string: 'a', new_string: 'b' };
        expect(allowlist.isAllowed(tool, input)).toBe(true);
    });

    it('handles null agentState without throwing', () => {
        const allowlist = new SessionAllowlist();
        allowlist.applyPermissionResponse({ approved: true, decision: 'approved_for_session', allowTools: ['Write'] });

        expect(() => allowlist.rehydrateFromAgentState(null)).not.toThrow();
        expect(allowlist.isAllowed('Write', {})).toBe(true);
    });
});
