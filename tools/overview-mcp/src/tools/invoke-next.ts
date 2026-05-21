import { deriveNextCommand } from '../../../../scripts/lib/derive-next-command.mjs';

import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { ServerContext } from '../context.js';
import type { InvokeNextInput } from '../schemas.js';
import type { NextCommand, RalphStage, Snapshot, SnapshotTask } from '../types.js';

const INVOCATION_GUIDANCE = 'Use the Skill tool to invoke this - for example: Skill("ralph-orchestration:run-ralph", args="...")';
const NO_NEXT_COMMAND_GUIDANCE = 'no next command - task is complete or has no actionable next step';

interface WorkOnViaCrewModule {
  runWorkOnViaCrew(options: {
    repoRoot: string;
    config: RalphOverviewConfig;
    taskId: string;
    stage: RalphStage;
    crewName: string;
    memberName?: string;
    stdout: NodeJS.WritableStream;
  }): Promise<CrewSessionRefResult>;
}

interface CrewSessionRefResult {
  crewName: string;
  memberName: string;
  stage: string;
  taskId: string;
  sessionId: string | null;
  ref: {
    crewName: string;
    memberName: string;
    cwd: string;
    startedAt: string;
    sessionId?: string;
    transcriptPath?: string;
  };
}

type WorkOnViaCrewModuleLoader = () => Promise<WorkOnViaCrewModule | null>;

export interface InvokeNextDefaultResult {
  ok: true;
  command: NextCommand | null;
  invocationGuidance: string;
}

export interface InvokeNextCrewResult {
  ok: true;
  sessionRef: CrewSessionRefResult;
}

export type InvokeNextResult = InvokeNextDefaultResult | InvokeNextCrewResult | { ok: false; error: string };

let workOnViaCrewModuleLoader: WorkOnViaCrewModuleLoader = loadWorkOnViaCrewModule;

export async function invokeNext(
  context: ServerContext,
  input: InvokeNextInput,
): Promise<InvokeNextResult> {
  const snapshot = await context.snapshotReader.getSnapshot();
  if (!snapshot) {
    return { ok: false, error: 'missing snapshot' };
  }

  const task = findTask(snapshot, input.taskId);
  if (!task) {
    return { ok: false, error: 'unknown task' };
  }

  if (!input.viaCrewMember) {
    const command = deriveNextCommand(task.ralph, task, { repoRoot: context.repoRoot });
    return {
      ok: true,
      command,
      invocationGuidance: command ? INVOCATION_GUIDANCE : NO_NEXT_COMMAND_GUIDANCE,
    };
  }

  const stage = task.ralph?.stage;
  if (!stage) {
    return { ok: false, error: 'missing task stage' };
  }

  const mod = await workOnViaCrewModuleLoader();
  if (!mod) {
    return { ok: false, error: 'requires plan 08' };
  }

  const sessionRef = await mod.runWorkOnViaCrew({
    repoRoot: context.repoRoot,
    config: context.config,
    taskId: task.id,
    stage,
    crewName: input.viaCrewMember.crewName,
    memberName: input.viaCrewMember.memberName,
    stdout: process.stderr,
  });

  return { ok: true, sessionRef };
}

export function __setWorkOnViaCrewModuleLoaderForTest(loader: WorkOnViaCrewModuleLoader): void {
  workOnViaCrewModuleLoader = loader;
}

export function __resetWorkOnViaCrewModuleLoaderForTest(): void {
  workOnViaCrewModuleLoader = loadWorkOnViaCrewModule;
}

async function loadWorkOnViaCrewModule(): Promise<WorkOnViaCrewModule | null> {
  const mod = await import('../../../../scripts/lib/work-on-via-crew.mjs').catch(() => null);
  return mod as WorkOnViaCrewModule | null;
}

function findTask(snapshot: Snapshot, taskId: string): SnapshotTask | undefined {
  const normalizedTaskId = taskId.toLowerCase();
  return snapshot.tasks.find((task) => task.id.toLowerCase() === normalizedTaskId);
}
