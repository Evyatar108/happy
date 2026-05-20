import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { listCrewSessions } from '../tools/list-crew-sessions.js';

import type { ServerContext } from '../context.js';
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { OverviewData, OverviewRalphState } from '../types.js';

let tempRoot: string;
let reader: SnapshotReader | null;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-crews-'));
  reader = null;
});

afterEach(async () => {
  vi.useRealTimers();
  await reader?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('overview.list_crew_sessions', () => {
  it('reuses discoverCrewSessions inputs, flattens live manifest fields, and filters by exact taskId', async () => {
    const context = await createContext();
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }, { id: 'TASK-12' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphState({ 'TASK-1': 'implementing', 'TASK-12': 'reviewing' }));
    await writeManifest(context.config.crewsRoot, 'crew-a', 'members', 'alice', {
      crew: 'crew-a',
      name: 'alice',
      cwd: context.repoRoot,
      startedAt: '2026-05-20T10:00:00.000Z',
      sessionId: 'session-a',
      transcriptPath: 'transcripts/a.jsonl',
      lastHeartbeatAt: '2026-05-20T10:05:00.000Z',
      lastSummary: 'Working on TASK-1.',
      lastTurnAt: '2026-05-20T10:06:00.000Z',
      listenerState: { status: 'listening' },
      actorState: { status: 'running' },
    });
    await writeManifest(context.config.crewsRoot, 'crew-b', 'leads', 'lead-b', {
      crew: 'crew-b',
      name: 'lead-b',
      cwd: context.repoRoot,
      startedAt: '2026-05-20T10:10:00.000Z',
      sessionId: 'session-b',
      lastHeartbeatAt: '2026-05-20T10:15:00.000Z',
      lastSummary: 'Reviewing TASK-12.',
    });

    await expect(listCrewSessions(context, { taskId: 'TASK-1' })).resolves.toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          taskId: 'TASK-1',
          stage: 'implementing',
          role: 'member',
          crewName: 'crew-a',
          memberName: 'alice',
          sessionId: 'session-a',
          lastHeartbeatAt: '2026-05-20T10:05:00.000Z',
          lastSummary: 'Working on TASK-1.',
          lastTurnAt: '2026-05-20T10:06:00.000Z',
          listenerState: { status: 'listening' },
          actorState: { status: 'running' },
        }),
      ],
    });

    const all = await listCrewSessions(context, {});
    expect(all).toMatchObject({ ok: true, data: [{ taskId: 'TASK-1' }, { taskId: 'TASK-12', role: 'lead' }] });
  });

  it('serves discovery from a 500 ms cache and live re-reads manifests after expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T10:00:00.000Z'));
    const context = await createContext();
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphState({ 'TASK-1': 'implementing' }));
    await writeManifest(
      context.config.crewsRoot,
      'crew-a',
      'members',
      'alice',
      manifest(context.repoRoot, '2026-05-20T10:00:00.000Z'),
    );

    await expect(listCrewSessions(context, {})).resolves.toMatchObject({
      ok: true,
      data: [{ lastHeartbeatAt: '2026-05-20T10:00:00.000Z' }],
    });

    await writeManifest(
      context.config.crewsRoot,
      'crew-a',
      'members',
      'alice',
      manifest(context.repoRoot, '2026-05-20T10:00:01.000Z'),
    );
    vi.setSystemTime(new Date('2026-05-20T10:00:00.400Z'));
    await expect(listCrewSessions(context, {})).resolves.toMatchObject({
      ok: true,
      data: [{ lastHeartbeatAt: '2026-05-20T10:00:00.000Z' }],
    });

    vi.setSystemTime(new Date('2026-05-20T10:00:00.600Z'));
    await expect(listCrewSessions(context, {})).resolves.toMatchObject({
      ok: true,
      data: [{ lastHeartbeatAt: '2026-05-20T10:00:01.000Z' }],
    });
  });

  it('returns an error when Ralph state is missing', async () => {
    const context = await createContext();
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }] });

    await expect(listCrewSessions(context, {})).resolves.toEqual({ ok: false, error: 'missing Ralph state' });
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

function ralphState(stages: Record<string, OverviewRalphState['byTaskId'][string]['stage']>): OverviewRalphState {
  return {
    generatedAt: '2026-05-20T10:00:00.000Z',
    generatedFromCommit: 'fixture',
    byTaskId: Object.fromEntries(Object.entries(stages).map(([taskId, stage]) => [taskId, { stage }])),
  };
}

function manifest(repoRoot: string, lastHeartbeatAt: string): Record<string, unknown> {
  return {
    crew: 'crew-a',
    name: 'alice',
    cwd: repoRoot,
    startedAt: '2026-05-20T09:59:00.000Z',
    sessionId: 'session-a',
    lastHeartbeatAt,
    lastSummary: 'Working on TASK-1.',
  };
}

async function writeOverviewData(filePath: string, data: OverviewData): Promise<void> {
  await fs.writeFile(filePath, `window.OVERVIEW_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
}

async function writeRalphState(filePath: string, data: OverviewRalphState): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeManifest(
  crewsRoot: string,
  crewName: string,
  role: 'members' | 'leads',
  memberName: string,
  data: Record<string, unknown>,
): Promise<void> {
  const manifestPath = path.join(crewsRoot, 'crews', crewName, role, memberName, 'manifest.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
