import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorktree, generateWorktreeName } from './worktree';

const mocks = vi.hoisted(() => ({
    machineBash: vi.fn(),
    randomUUID: vi.fn(),
}));

vi.mock('@/sync/ops', () => ({
    machineBash: mocks.machineBash,
}));

vi.mock('expo-crypto', () => ({
    randomUUID: mocks.randomUUID,
}));

function mockUuidSequence(values: string[]): void {
    let index = 0;
    mocks.randomUUID.mockImplementation(() => {
        const value = values[index++];
        if (!value) {
            throw new Error('randomUUID called more times than expected');
        }
        return value;
    });
}

describe('worktree utilities', () => {
    beforeEach(() => {
        mocks.machineBash.mockReset();
        mocks.randomUUID.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('generateWorktreeName', () => {
        it('returns the ralph-prefixed first eight UUID hex characters', () => {
            mockUuidSequence(['12345678-90ab-cdef-1234-567890abcdef']);

            expect(generateWorktreeName()).toBe('ralph-12345678');
        });

        it('generates 10,000 unique names in sequence', () => {
            mockUuidSequence(Array.from({ length: 10_000 }, (_, index) => (
                `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
            )));

            const names = Array.from({ length: 10_000 }, () => generateWorktreeName());

            expect(new Set(names).size).toBe(10_000);
        });
    });

    it('retries git-side name collisions with fresh UUID names', async () => {
        mockUuidSequence([
            'aaaaaaaa-0000-4000-8000-000000000000',
            'bbbbbbbb-0000-4000-8000-000000000000',
            'cccccccc-0000-4000-8000-000000000000',
            'dddddddd-0000-4000-8000-000000000000',
        ]);
        mocks.machineBash
            .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
            .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'already exists', exitCode: 128 })
            .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'already exists', exitCode: 128 })
            .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'already exists', exitCode: 128 })
            .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 });

        const result = await createWorktree('machine-1', '/repo');

        expect(result).toEqual({
            success: true,
            worktreePath: '/repo/.dev/worktree/ralph-dddddddd',
            branchName: 'ralph-dddddddd',
            error: undefined,
        });
        expect(mocks.machineBash).toHaveBeenCalledTimes(5);
        expect(mocks.machineBash).toHaveBeenNthCalledWith(2, 'machine-1', 'git worktree add -b ralph-aaaaaaaa .dev/worktree/ralph-aaaaaaaa', '/repo');
        expect(mocks.machineBash).toHaveBeenNthCalledWith(3, 'machine-1', 'git worktree add -b ralph-bbbbbbbb .dev/worktree/ralph-bbbbbbbb', '/repo');
        expect(mocks.machineBash).toHaveBeenNthCalledWith(4, 'machine-1', 'git worktree add -b ralph-cccccccc .dev/worktree/ralph-cccccccc', '/repo');
        expect(mocks.machineBash).toHaveBeenNthCalledWith(5, 'machine-1', 'git worktree add -b ralph-dddddddd .dev/worktree/ralph-dddddddd', '/repo');
    });
});
