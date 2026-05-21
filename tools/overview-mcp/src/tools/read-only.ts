import fs from 'node:fs/promises';
import path from 'node:path';

import { assertSafeTaskId } from '../../../../scripts/lib/append-journal.mjs';
import { deriveNextCommand } from '../../../../scripts/lib/derive-next-command.mjs';

import type { ServerContext } from '../context.js';
import type {
  NextCommand,
  OverviewData,
  Recommendation,
  RalphPipelineState,
  RalphStage,
  Snapshot,
  SnapshotTask,
} from '../types.js';
import type {
  GetTaskInput,
  ListRecommendationsInput,
  ListTasksInput,
  NextCommandInput,
} from '../schemas.js';

export type ToolEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ListTaskResult {
  taskId: string;
  title: string;
  stage?: RalphStage;
  jobSlug?: string;
  lastUpdatedAt?: string;
}

export type GetTaskResult = SnapshotTask & { recentJournal: string[] };

export async function listTasks(context: ServerContext, input: ListTasksInput): Promise<ToolEnvelope<ListTaskResult[]>> {
  const snapshot = await context.snapshotReader.getSnapshot();
  if (!snapshot) {
    return { ok: false, error: 'missing snapshot' };
  }

  const overviewData = await context.snapshotReader.getOverviewData();
  const filter = input.filter ?? {};
  const data = snapshot.tasks
    .filter((task) => matchesTaskFilter(task, overviewData, filter))
    .map((task) => ({
      taskId: task.id,
      title: taskTitle(task),
      stage: task.ralph?.stage,
      jobSlug: task.ralph?.jobSlug ?? task.ralph?.groupSlug,
      lastUpdatedAt: task.ralph?.lastUpdatedAt ?? task.lastTouchedAt,
    }));

  return { ok: true, data };
}

export async function getTask(context: ServerContext, input: GetTaskInput): Promise<ToolEnvelope<GetTaskResult>> {
  try {
    assertSafeTaskId(input.taskId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid taskId' };
  }

  const snapshot = await context.snapshotReader.getSnapshot();
  if (!snapshot) {
    return { ok: false, error: 'missing snapshot' };
  }

  const task = findTask(snapshot, input.taskId);
  if (!task) {
    return { ok: false, error: 'unknown task' };
  }

  const recentJournal = await readRecentJournal(context.repoRoot, task.id);
  return { ok: true, data: { ...task, recentJournal } };
}

export async function nextCommand(
  context: ServerContext,
  input: NextCommandInput,
): Promise<ToolEnvelope<NextCommand | null>> {
  const snapshot = await context.snapshotReader.getSnapshot();
  if (!snapshot) {
    return { ok: false, error: 'missing snapshot' };
  }

  const task = findTask(snapshot, input.taskId);
  if (!task) {
    return { ok: false, error: 'unknown task' };
  }

  return { ok: true, data: deriveNextCommand(task.ralph, task, { repoRoot: context.repoRoot }) };
}

export async function listRecommendations(
  context: ServerContext,
  input: ListRecommendationsInput,
): Promise<ToolEnvelope<Recommendation[]>> {
  const snapshot = await context.snapshotReader.getSnapshot();
  const snapshotRecommendations = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : null;
  const recommendations = snapshotRecommendations ?? (await readRecommendationFallback(context.config.outputs.recommendationsJson));

  if (!recommendations) {
    return { ok: false, error: 'no recommendations available' };
  }

  let data = recommendations;
  if (input.stageFilter) {
    data = data.filter((recommendation) => recommendation.stage === input.stageFilter);
  }
  if (typeof input.limit === 'number') {
    data = data.slice(0, input.limit);
  }

  return { ok: true, data };
}

export async function listBlockers(context: ServerContext): Promise<ToolEnvelope<SnapshotTask[]>> {
  const snapshot = await context.snapshotReader.getSnapshot();
  if (!snapshot) {
    return { ok: false, error: 'missing snapshot' };
  }

  return { ok: true, data: snapshot.tasks.filter(isBlocker) };
}

export function toToolResult(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: `${JSON.stringify(value, null, 2)}\n` }],
  };
}

function matchesTaskFilter(
  task: SnapshotTask,
  overviewData: OverviewData | null,
  filter: NonNullable<ListTasksInput['filter']>,
): boolean {
  if (filter.stage && task.ralph?.stage !== filter.stage) {
    return false;
  }
  if (filter.scope && task.scope !== filter.scope) {
    return false;
  }
  if (filter.workstream && overviewData?.workstream?.[task.id] !== filter.workstream) {
    return false;
  }
  if (typeof filter.hasDeferredQuestions === 'boolean') {
    const hasDeferredQuestions = (task.ralph?.deferredQuestionsCount ?? 0) > 0;
    if (hasDeferredQuestions !== filter.hasDeferredQuestions) {
      return false;
    }
  }
  if (typeof filter.hasOpenFindings === 'boolean') {
    const hasOpenFindings = hasOpenReviewFindings(task.ralph);
    if (hasOpenFindings !== filter.hasOpenFindings) {
      return false;
    }
  }
  return true;
}

function isBlocker(task: SnapshotTask): boolean {
  return task.ralph?.stage === 'blocked' || hasOpenReviewFindings(task.ralph) || (task.ralph?.deferredQuestionsCount ?? 0) > 0;
}

function hasOpenReviewFindings(ralph: RalphPipelineState | undefined): boolean {
  return Object.values(ralph?.reviewOpenCount ?? {}).some((n) => (n ?? 0) > 0);
}

function findTask(snapshot: Snapshot, taskId: string): SnapshotTask | undefined {
  const normalizedTaskId = taskId.toLowerCase();
  return snapshot.tasks.find((task) => task.id.toLowerCase() === normalizedTaskId);
}

async function readRecentJournal(repoRoot: string, taskId: string): Promise<string[]> {
  const tasksRoot = path.resolve(repoRoot, 'tasks');
  const journalPath = path.resolve(tasksRoot, taskId, 'journal.md');
  const relative = path.relative(tasksRoot, journalPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [];
  }

  try {
    const text = await fs.readFile(journalPath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-3);
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}

async function readRecommendationFallback(filePath: string): Promise<Recommendation[] | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as Recommendation[];
    }
    if (isRecord(parsed) && Array.isArray(parsed.recommendations)) {
      return parsed.recommendations as Recommendation[];
    }
    return null;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

function taskTitle(task: SnapshotTask): string {
  return plaintext(task.command?.descriptionHtml) ?? task.command?.name ?? task.id;
}

function plaintext(html: string | undefined): string | undefined {
  if (!html) {
    return undefined;
  }
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return text || undefined;
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
