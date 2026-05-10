import { describe, expect, it } from 'vitest';
import { createCodexPatchApprovalInput, snapshotCodexFileChanges } from './codexApprovalSnapshot';

type TestFileChange = {
    diff: string;
    kind: { type: string; move_path: string | null };
};

describe('Codex patch approval consistency', () => {
    it('snapshots raw file changes before building the CodexPatch approval input', () => {
        const itemId = 'patch-approval-1';
        const rawFileChangesByItemId = new Map<string, Record<string, unknown>>([[itemId, {
            'README.md': {
                diff: '@@ -1 +1 @@\n-old\n+new',
                kind: { type: 'update', move_path: null },
            },
        }]]);

        const approvalFileChanges = snapshotCodexFileChanges(rawFileChangesByItemId.get(itemId));
        const codexPatchInput = createCodexPatchApprovalInput(approvalFileChanges);

        const liveChanges = rawFileChangesByItemId.get(itemId) as Record<string, TestFileChange>;
        liveChanges['README.md']!.diff = '@@ -1 +1 @@\n-mutated\n+mutated';
        liveChanges['src/new.ts'] = {
            diff: '@@ -0,0 +1 @@\n+export const added = true;',
            kind: { type: 'add', move_path: null },
        };
        (approvalFileChanges?.['README.md'] as Record<string, unknown>).diff = '@@ -1 +1 @@\n-second\n+mutation';

        expect(codexPatchInput).toEqual({
            changes: {
                'README.md': {
                    diff: '@@ -1 +1 @@\n-old\n+new',
                    kind: { type: 'update', move_path: null },
                },
            },
        });
        expect(codexPatchInput.changes).not.toBe(rawFileChangesByItemId.get(itemId));
        expect(codexPatchInput.changes).not.toBe(approvalFileChanges);
    });
});
