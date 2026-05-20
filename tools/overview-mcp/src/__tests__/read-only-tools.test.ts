import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServer } from '../server.js';
import { SnapshotReader } from '../snapshot-reader.js';
import { addJournalEntry } from '../tools/add-journal-entry.js';
import {
  getTask,
  listBlockers,
  listRecommendations,
  listTasks,
  nextCommand,
} from '../tools/read-only.js';

import type { ServerContext } from '../context.js';
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { OverviewData, Recommendation, Snapshot, SnapshotTask } from '../types.js';

let tempRoot: string;
let reader: SnapshotReader | null;
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-tools-'));
  reader = null;
});

afterEach(async () => {
  await reader?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('read-only tool registration', () => {
  it('registers all five read-only tools', async () => {
    const context = await createContext();
    const server = createServer(context) as unknown as { _registeredTools: Record<string, unknown> };

    expect(Object.keys(server._registeredTools).sort()).toEqual([
      'overview.add_journal_entry',
      'overview.get_task',
      'overview.list_blockers',
      'overview.list_recommendations',
      'overview.list_tasks',
      'overview.next_command',
    ]);
  });
});

describe('overview.add_journal_entry', () => {
  it('appends a note with an explicit timestamp and rejects unsafe task ids', async () => {
    const context = await createContext();

    expect(addJournalEntry(context, { taskId: 'TASK-1', ts: '2026-05-20T02:00:00.000Z', note: 'hello\nworld' })).toEqual({
      ok: true,
      data: { taskId: 'TASK-1', ts: '2026-05-20T02:00:00.000Z' },
    });
    expect(await readJournal(context.repoRoot, 'TASK-1')).toBe('- 2026-05-20T02:00:00.000Z  note: hello\n  world\n');

    expect(addJournalEntry(context, { taskId: '../TASK-1', note: 'bad' })).toEqual({
      ok: false,
      error: 'invalid taskId: ../TASK-1',
    });
  });

  it('defaults ts to the current ISO timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T03:04:05.006Z'));
    try {
      const context = await createContext();

      expect(addJournalEntry(context, { taskId: 'TASK-2', note: 'default timestamp' })).toEqual({
        ok: true,
        data: { taskId: 'TASK-2', ts: '2026-05-20T03:04:05.006Z' },
      });
      expect(await readJournal(context.repoRoot, 'TASK-2')).toBe(
        '- 2026-05-20T03:04:05.006Z  note: default timestamp\n',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('overview.list_tasks', () => {
  it('filters tasks and returns fallback plaintext titles; missing snapshot errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    await writeOverviewData(context.config.dataFile, { workstream: { 'TASK-1': 'core', 'TASK-2': 'docs' } });

    await expect(
      listTasks(context, { filter: { stage: 'implementing', scope: 'app', workstream: 'core', hasOpenFindings: true } }),
    ).resolves.toEqual({
      ok: true,
      data: [
        {
          taskId: 'TASK-1',
          title: 'Alpha & beta',
          stage: 'implementing',
          jobSlug: 'job-alpha',
          lastUpdatedAt: '2026-05-20T01:00:00.000Z',
        },
      ],
    });

    const missingContext = await createContext('missing');
    await expect(listTasks(missingContext, {})).resolves.toEqual({ ok: false, error: 'missing snapshot' });
  });
});

describe('overview.get_task', () => {
  it('returns a known task with the last three journal lines; unknown task errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    await fs.mkdir(path.join(context.repoRoot, 'tasks', 'TASK-1'), { recursive: true });
    await fs.writeFile(
      path.join(context.repoRoot, 'tasks', 'TASK-1', 'journal.md'),
      ['- one', '- two', '- three', '- four', ''].join('\n'),
      'utf8',
    );

    const found = await getTask(context, { taskId: 'task-1' });
    expect(found).toMatchObject({
      ok: true,
      data: { id: 'TASK-1', recentJournal: ['- two', '- three', '- four'] },
    });

    await expect(getTask(context, { taskId: '../TASK-1' })).resolves.toEqual({ ok: false, error: 'unknown task' });
  });
});

describe('overview.next_command', () => {
  it('matches derive-next-command-cli output; unknown task errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    const fromTool = await nextCommand(context, { taskId: 'TASK-1' });
    const fromCli = JSON.parse(
      execFileSync('node', ['scripts/lib/derive-next-command-cli.mjs', '--task', 'TASK-1', '--snapshot', context.config.outputs.snapshot], {
        cwd: repoRoot,
        encoding: 'utf8',
      }),
    );

    expect(fromTool).toEqual({ ok: true, data: fromCli });
    await expect(nextCommand(context, { taskId: 'NOPE' })).resolves.toEqual({ ok: false, error: 'unknown task' });
  });
});

describe('overview.list_recommendations', () => {
  it('lists snapshot recommendations with limit and stageFilter; missing sources error', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, {
      ...snapshotWithTasks(),
      recommendations: [
        recommendation('TASK-1', 'implementing', 0.9),
        recommendation('TASK-2', 'blocked', 0.8),
      ],
    });

    await expect(listRecommendations(context, { stageFilter: 'blocked', limit: 1 })).resolves.toEqual({
      ok: true,
      data: [recommendation('TASK-2', 'blocked', 0.8)],
    });

    const missingContext = await createContext('missing-recommendations');
    await expect(listRecommendations(missingContext, {})).resolves.toEqual({
      ok: false,
      error: 'no recommendations available',
    });
  });

  it('falls back to overview-recommendations.json when the snapshot is missing', async () => {
    const context = await createContext();
    await fs.writeFile(
      context.config.outputs.recommendationsJson,
      `${JSON.stringify({ recommendations: [recommendation('TASK-3', 'planning', 0.7)] })}\n`,
      'utf8',
    );

    await expect(listRecommendations(context, {})).resolves.toEqual({
      ok: true,
      data: [recommendation('TASK-3', 'planning', 0.7)],
    });
  });
});

describe('overview.list_blockers', () => {
  it('returns tasks blocked by stage, findings, or deferred questions; missing snapshot errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    const blockers = await listBlockers(context);
    expect(blockers).toMatchObject({
      ok: true,
      data: [{ id: 'TASK-1' }, { id: 'TASK-2' }, { id: 'TASK-3' }],
    });

    const missingContext = await createContext('missing-blockers');
    await expect(listBlockers(missingContext)).resolves.toEqual({ ok: false, error: 'missing snapshot' });
  });
});

async function createContext(name = 'repo'): Promise<ServerContext> {
  const repoRoot = path.join(tempRoot, name);
  const config = await writeFixtureConfig(repoRoot);
  reader = new SnapshotReader(config);
  return { repoRoot, config, snapshotReader: reader };
}

async function writeFixtureConfig(repoRoot: string): Promise<RalphOverviewConfig> {
  const plansDir = path.join(repoRoot, 'plans');
  await fs.mkdir(plansDir, { recursive: true });
  return {
    dataFile: path.join(plansDir, 'overview-data.js'),
    ralphRoot: path.join(repoRoot, '.ralph'),
    crewsRoot: path.join(repoRoot, '.crews'),
    ralphSubdirs: {
      jobs: path.join(repoRoot, '.ralph', 'jobs'),
      jobGroups: path.join(repoRoot, '.ralph', 'job-groups'),
      brainstorms: path.join(repoRoot, '.ralph', 'brainstorms'),
    },
    outputs: {
      sidecarJs: path.join(plansDir, 'overview-ralph-state.js'),
      sidecarJson: path.join(plansDir, 'overview-ralph-state.json'),
      snapshot: path.join(plansDir, 'overview-snapshot.json'),
      activity: path.join(plansDir, 'overview-activity.jsonl'),
      activityBackup: path.join(plansDir, 'overview-activity.1.jsonl'),
      dataJson: path.join(plansDir, 'overview-data.json'),
      snapshotSchema: path.join(plansDir, 'overview-snapshot.schema.json'),
      tasksIndex: path.join(repoRoot, 'tasks', 'INDEX.md'),
      recommendationsJson: path.join(plansDir, 'overview-recommendations.json'),
      dependencyGraphJson: path.join(plansDir, 'overview-dependency-graph.json'),
      activityMaxLines: 1000,
    },
    recommendations: {
      weights: { stageUrgency: 1, dependencyState: 1, freshness: 1, priority: 1 },
      topN: 5,
    },
    lockFile: path.join(repoRoot, '.ralph', 'overview-sync.lock'),
    watcher: { ignored: [] },
  };
}

async function readJournal(repoRoot: string, taskId: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, 'tasks', taskId, 'journal.md'), 'utf8');
}

function snapshotWithTasks(): Snapshot {
  const tasks: SnapshotTask[] = [
    {
      id: 'TASK-1',
      scope: 'app',
      command: { name: 'alpha', descriptionHtml: '<strong>Alpha</strong> &amp; beta' },
      ralph: {
        stage: 'implementing',
        jobSlug: 'job-alpha',
        reviewOpenCount: { code: 1 },
        deferredQuestionsCount: 0,
        lastUpdatedAt: '2026-05-20T01:00:00.000Z',
      },
    },
    {
      id: 'TASK-2',
      scope: 'app',
      command: { name: 'blocked-task' },
      ralph: { stage: 'blocked', jobSlug: 'job-blocked', reviewOpenCount: { docs: 0 }, deferredQuestionsCount: 0 },
    },
    {
      id: 'TASK-3',
      scope: 'server',
      command: { name: 'questions-task' },
      ralph: { stage: 'planning', jobSlug: 'job-questions', deferredQuestionsCount: 2 },
    },
    {
      id: 'TASK-4',
      scope: 'server',
      command: { name: 'clear-task' },
      ralph: { stage: 'shipped', jobSlug: 'job-clear', deferredQuestionsCount: 0 },
    },
  ];
  return {
    generatedAt: '2026-05-20T00:00:00.000Z',
    generatedFromCommit: 'fixture',
    schemaVersion: 1,
    tasks,
    runs: [],
    recommendations: [],
    dependencyGraph: { nodes: [], edges: [] },
    runDurations: {},
    unmatched: [],
    unmatchedSummary: {},
  };
}

function recommendation(taskId: string, stage: Recommendation['stage'], score: number): Recommendation {
  return { taskId, score, stage, reasons: [`${stage} stage`] };
}

async function writeSnapshot(filePath: string, snapshot: Snapshot): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

async function writeOverviewData(filePath: string, data: OverviewData): Promise<void> {
  await fs.writeFile(filePath, `window.OVERVIEW_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
}
