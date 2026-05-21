import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SnapshotReader } from '../snapshot-reader.js';

import type { ServerContext } from '../context.js';
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { OverviewData, Recommendation, Snapshot, SnapshotTask } from '../types.js';

export const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

export function snapshotWithTasks(): Snapshot {
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
      command: { name: 'blocked-task', descriptionHtml: '' },
      ralph: { stage: 'blocked', jobSlug: 'job-blocked', reviewOpenCount: { docs: 0 }, deferredQuestionsCount: 0 },
    },
    {
      id: 'TASK-3',
      scope: 'server',
      command: { name: 'questions-task', descriptionHtml: '' },
      ralph: { stage: 'planning', jobSlug: 'job-questions', deferredQuestionsCount: 2 },
    },
    {
      id: 'TASK-4',
      scope: 'server',
      command: { name: 'clear-task', descriptionHtml: '' },
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

export function recommendation(taskId: string, stage: Recommendation['stage'], score: number): Recommendation {
  return { taskId, score, stage, reasons: [`${stage} stage`] };
}

export async function writeSnapshot(filePath: string, snapshot: Snapshot): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export async function writeOverviewData(filePath: string, data: OverviewData): Promise<void> {
  await fs.writeFile(filePath, `window.OVERVIEW_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
}

export async function readJournal(repoRoot: string, taskId: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, 'tasks', taskId, 'journal.md'), 'utf8');
}

export async function writeFixtureConfig(repoRoot: string): Promise<RalphOverviewConfig> {
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

export async function makeContext(tempRoot: string, readerRef: { current: SnapshotReader | null }, name = 'repo'): Promise<ServerContext> {
  const contextRepoRoot = path.join(tempRoot, name);
  const config = await writeFixtureConfig(contextRepoRoot);
  readerRef.current = new SnapshotReader(config);
  return { repoRoot: contextRepoRoot, config, snapshotReader: readerRef.current };
}

export function makeTempDir(): { tempRoot: string } {
  return { tempRoot: '' };
}

export async function setupTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-tools-'));
}
