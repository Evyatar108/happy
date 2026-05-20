import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';

import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { OverviewData, Snapshot } from '../types.js';

let tempRoot: string;
let reader: SnapshotReader | null;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-reader-'));
  reader = null;
});

afterEach(async () => {
  await reader?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('SnapshotReader', () => {
  it('lazily reads snapshots and refreshes after watched file changes', async () => {
    const config = await writeFixtureConfig();
    await writeSnapshot(config.outputs.snapshot, snapshotWithTask('TASK-001'));
    reader = new SnapshotReader(config);
    await startReader(reader);

    await expect(reader.getSnapshot()).resolves.toMatchObject({
      tasks: [{ id: 'TASK-001' }],
    });

    await writeSnapshot(config.outputs.snapshot, snapshotWithTask('TASK-002'));

    await expectEventually(async () => {
      const next = await reader?.getSnapshot();
      expect(next?.tasks[0]?.id).toBe('TASK-002');
    });
  });

  it('returns null when the snapshot file is missing', async () => {
    const config = await writeFixtureConfig();
    reader = new SnapshotReader(config);

    await expect(reader.getSnapshot()).resolves.toBeNull();
  });

  it('reuses loadOverviewData and refreshes overview-data after file changes', async () => {
    const config = await writeFixtureConfig();
    await writeOverviewData(config.dataFile, { tasks: [{ id: 'TASK-001' }] });
    reader = new SnapshotReader(config);
    await startReader(reader);

    await expect(reader.getOverviewData()).resolves.toMatchObject({
      tasks: [{ id: 'TASK-001' }],
    });

    await writeOverviewData(config.dataFile, { tasks: [{ id: 'TASK-002' }] });

    await expectEventually(async () => {
      const next = await reader?.getOverviewData();
      expect(next?.tasks?.[0]?.id).toBe('TASK-002');
    });
  });

  it('returns the cached snapshot on torn reads and recovers on the next valid write', async () => {
    const config = await writeFixtureConfig();
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await writeSnapshot(config.outputs.snapshot, snapshotWithTask('TASK-001'));
    reader = new SnapshotReader(config);
    await startReader(reader);

    await expect(reader.getSnapshot()).resolves.toMatchObject({
      tasks: [{ id: 'TASK-001' }],
    });

    await fs.writeFile(config.outputs.snapshot, '{"tasks":[', 'utf8');

    await expectEventually(async () => {
      const cached = await reader?.getSnapshot();
      expect(cached?.tasks[0]?.id).toBe('TASK-001');
      expect(warning).toHaveBeenCalledTimes(1);
    });

    await writeSnapshot(config.outputs.snapshot, snapshotWithTask('TASK-002'));

    await expectEventually(async () => {
      const recovered = await reader?.getSnapshot();
      expect(recovered?.tasks[0]?.id).toBe('TASK-002');
    });
  });
});

async function writeFixtureConfig(): Promise<RalphOverviewConfig> {
  const plansDir = path.join(tempRoot, 'plans');
  await fs.mkdir(plansDir, { recursive: true });
  return {
    dataFile: path.join(plansDir, 'overview-data.js'),
    ralphRoot: path.join(tempRoot, '.ralph'),
    crewsRoot: path.join(tempRoot, '.crews'),
    ralphSubdirs: {
      jobs: path.join(tempRoot, '.ralph', 'jobs'),
      jobGroups: path.join(tempRoot, '.ralph', 'job-groups'),
      brainstorms: path.join(tempRoot, '.ralph', 'brainstorms'),
    },
    outputs: {
      sidecarJs: path.join(plansDir, 'overview-data.js'),
      sidecarJson: path.join(plansDir, 'overview-data.json'),
      snapshot: path.join(plansDir, 'overview-snapshot.json'),
      activity: path.join(plansDir, 'overview-activity.jsonl'),
      activityBackup: path.join(plansDir, 'overview-activity.backup.jsonl'),
      dataJson: path.join(plansDir, 'overview-data.json'),
      snapshotSchema: path.join(plansDir, 'overview-snapshot.schema.json'),
      tasksIndex: path.join(plansDir, 'overview-tasks-index.md'),
      recommendationsJson: path.join(plansDir, 'overview-recommendations.json'),
      dependencyGraphJson: path.join(plansDir, 'overview-dependency-graph.json'),
      activityMaxLines: 1000,
    },
    recommendations: {
      weights: {
        stageUrgency: 1,
        dependencyState: 1,
        freshness: 1,
        priority: 1,
      },
      topN: 5,
    },
    lockFile: path.join(tempRoot, '.ralph', 'overview-sync.lock'),
    watcher: { ignored: [] },
  };
}

function snapshotWithTask(taskId: string): Snapshot {
  return {
    generatedAt: '2026-05-20T00:00:00.000Z',
    generatedFromCommit: 'fixture',
    schemaVersion: 1,
    tasks: [{ id: taskId }],
    runs: [],
    recommendations: [],
    dependencyGraph: { nodes: [], edges: [] },
    runDurations: {},
    unmatched: [],
    unmatchedSummary: {},
  };
}

async function writeSnapshot(filePath: string, snapshot: Snapshot): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

async function writeOverviewData(filePath: string, data: OverviewData): Promise<void> {
  await fs.writeFile(filePath, `window.OVERVIEW_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
}

async function expectEventually(assertion: () => Promise<void>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
  throw lastError;
}

function startReader(snapshotReader: SnapshotReader): Promise<void> {
  return new Promise((resolve) => {
    snapshotReader.start().once('ready', resolve);
  });
}
