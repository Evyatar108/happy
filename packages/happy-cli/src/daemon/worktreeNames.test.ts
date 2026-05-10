import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWorktreeName } from '@/daemon/worktreeNames';

const mocks = vi.hoisted(() => ({
  randomUUID: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

describe('daemon worktree names', () => {
  beforeEach(() => {
    mocks.randomUUID.mockReset();
  });

  it('uses the same ralph-prefixed UUID naming format as the app helper', () => {
    mocks.randomUUID.mockReturnValue('12345678-90ab-cdef-1234-567890abcdef');

    expect(generateWorktreeName()).toBe('ralph-12345678');
  });
});
