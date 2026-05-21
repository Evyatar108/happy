import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import {
  __resetWorkOnViaCrewModuleLoaderForTest,
  __setWorkOnViaCrewModuleLoaderForTest,
  invokeNext,
} from '../tools/invoke-next.js';

import type { ServerContext } from '../context.js';
import { makeContext, setupTempRoot, snapshotWithTasks, writeSnapshot } from './helpers.js';

let tempRoot: string;
const readerRef: { current: SnapshotReader | null } = { current: null };

function createContext(name = 'repo'): Promise<ServerContext> {
  return makeContext(tempRoot, readerRef, name);
}

beforeEach(async () => {
  tempRoot = await setupTempRoot();
  readerRef.current = null;
});

afterEach(async () => {
  __resetWorkOnViaCrewModuleLoaderForTest();
  await readerRef.current?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('overview.invoke_next', () => {
  it('returns default invocation guidance with the derived command', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    await expect(invokeNext(context, { taskId: 'TASK-1' })).resolves.toEqual({
      ok: true,
      command: {
        label: 'Resume implementation',
        command: '/implement-with-ralph resume job-alpha',
        icon: '⚙️',
      },
      invocationGuidance: 'Use the Skill tool to invoke this - for example: Skill("ralph-orchestration:run-ralph", args="...")',
    });
  });

  it('returns no-next-command guidance for shipped tasks', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    await expect(invokeNext(context, { taskId: 'TASK-4' })).resolves.toEqual({
      ok: true,
      command: null,
      invocationGuidance: 'no next command - task is complete or has no actionable next step',
    });
  });

  it('delegates viaCrewMember with stdout redirected to stderr', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    const runWorkOnViaCrew = vi.fn().mockResolvedValue({
      crewName: 'ralph-pipeline',
      memberName: 'member-a',
      stage: 'implementing',
      taskId: 'TASK-1',
      sessionId: 'session-1',
      ref: { crewName: 'ralph-pipeline', memberName: 'member-a', cwd: context.repoRoot, startedAt: '2026-05-20T01:00:00.000Z' },
    });
    __setWorkOnViaCrewModuleLoaderForTest(async () => ({ runWorkOnViaCrew }));

    await expect(
      invokeNext(context, { taskId: 'TASK-1', viaCrewMember: { crewName: 'ralph-pipeline', memberName: 'member-a' } }),
    ).resolves.toEqual({
      ok: true,
      sessionRef: {
        crewName: 'ralph-pipeline',
        memberName: 'member-a',
        stage: 'implementing',
        taskId: 'TASK-1',
        sessionId: 'session-1',
        ref: {
          crewName: 'ralph-pipeline',
          memberName: 'member-a',
          cwd: context.repoRoot,
          startedAt: '2026-05-20T01:00:00.000Z',
        },
      },
    });

    expect(runWorkOnViaCrew).toHaveBeenCalledWith({
      repoRoot: context.repoRoot,
      config: context.config,
      taskId: 'TASK-1',
      stage: 'implementing',
      crewName: 'ralph-pipeline',
      memberName: 'member-a',
      stdout: process.stderr,
    });
  });

  it('returns requires plan 08 when the dynamic import is unavailable', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    __setWorkOnViaCrewModuleLoaderForTest(async () => null);

    await expect(invokeNext(context, { taskId: 'TASK-1', viaCrewMember: { crewName: 'ralph-pipeline' } })).resolves.toEqual({
      ok: false,
      error: 'requires plan 08',
    });
  });
});
