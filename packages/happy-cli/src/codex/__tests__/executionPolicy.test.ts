import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

    describe('Windows-vs-non-Windows sandbox split (F-005 regression)', () => {
        it.each(['default', 'read-only', 'safe-yolo', 'yolo'] as const)(
            'on Windows the per-mode mapping is retained for %s because sandboxManagedByHappy is forced false',
            (mode) => {
                const expected = {
                    default: { approvalPolicy: 'untrusted', sandbox: 'workspace-write' },
                    'read-only': { approvalPolicy: 'never', sandbox: 'read-only' },
                    'safe-yolo': { approvalPolicy: 'on-failure', sandbox: 'workspace-write' },
                    yolo: { approvalPolicy: 'on-failure', sandbox: 'danger-full-access' },
                } as const;
                expect(resolveCodexExecutionPolicy(mode, false)).toEqual(expected[mode]);
            },
        );

        it.each(['default', 'read-only', 'safe-yolo', 'yolo'] as const)(
            'on non-Windows with managed-sandbox enabled the forced danger-full-access policy applies to %s',
            (mode) => {
                expect(resolveCodexExecutionPolicy(mode, true)).toEqual({
                    approvalPolicy: 'never',
                    sandbox: 'danger-full-access',
                });
            },
        );

        it('codexAppServerClient gates sandboxEnabled on process.platform !== win32', async () => {
            const source = await readFile(
                fileURLToPath(new URL('../codexAppServerClient.ts', import.meta.url)),
                'utf8',
            );
            expect(source).toContain("this.sandboxConfig?.enabled && process.platform !== 'win32'");
        });
    });
});
