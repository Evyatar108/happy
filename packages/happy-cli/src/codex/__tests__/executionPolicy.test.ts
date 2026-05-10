import { describe, expect, it } from 'vitest';
import { resolveCodexExecutionPolicy } from '../executionPolicy';

describe('resolveCodexExecutionPolicy', () => {
    it('forces never + danger-full-access when sandbox is managed by Happy', () => {
        const policy = resolveCodexExecutionPolicy('default', true);

        expect(policy).toEqual({
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
        });
    });

    it('maps codex default mode to untrusted + workspace-write without managed sandbox', () => {
        const policy = resolveCodexExecutionPolicy('default', false);

        expect(policy).toEqual({
            approvalPolicy: 'untrusted',
            sandbox: 'workspace-write',
        });
    });

    it('maps read-only mode to never + read-only without managed sandbox', () => {
        const policy = resolveCodexExecutionPolicy('read-only', false);

        expect(policy).toEqual({
            approvalPolicy: 'never',
            sandbox: 'read-only',
        });
    });

    it.each([
        ['default', 'untrusted', 'workspace-write'],
        ['read-only', 'never', 'read-only'],
        ['safe-yolo', 'on-failure', 'workspace-write'],
        ['yolo', 'on-failure', 'danger-full-access'],
    ] as const)('maps %s to the expected Codex policy without managed sandbox', (mode, approvalPolicy, sandbox) => {
        expect(resolveCodexExecutionPolicy(mode, false)).toEqual({ approvalPolicy, sandbox });
    });

    it.each(['default', 'read-only', 'safe-yolo', 'yolo'] as const)(
        'lets the Happy-managed sandbox own enforcement for %s',
        (mode) => {
            expect(resolveCodexExecutionPolicy(mode, true)).toEqual({
                approvalPolicy: 'never',
                sandbox: 'danger-full-access',
            });
        },
    );
});
