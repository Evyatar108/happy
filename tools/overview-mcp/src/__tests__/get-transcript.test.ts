import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { ProcessManager } from '../process-manager.js';
import { getTranscript } from '../tools/get-transcript.js';
import { tailTranscript } from '../utils/transcript-tail.js';

import type { ServerContext } from '../context.js';
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';
import type { OverviewData, OverviewRalphState } from '../types.js';

let tempRoot: string;
let reader: SnapshotReader | null;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-transcript-'));
  reader = null;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reader?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('tailTranscript', () => {
  it('returns the last 20 user/assistant turns by default and caps lastN at 100', async () => {
    const transcriptPath = path.join(tempRoot, 'mixed.jsonl');
    await writeTranscript(transcriptPath, mixedTranscriptEntries(50));

    const result = tailTranscript({ transcriptPath, lastN: 200 });

    expect(result).toHaveLength(30);
    expect(result.every((turn) => turn.type === 'user' || turn.type === 'assistant')).toBe(true);
    expect(result.at(-20)?.seq).toBe(16);
    expect(result.at(-1)?.seq).toBe(47);
    expect(tailTranscript({ transcriptPath })).toEqual(result.slice(-20));
  });

  it('retains tool events when includeToolEvents is true', async () => {
    const transcriptPath = path.join(tempRoot, 'with-tools.jsonl');
    await writeTranscript(transcriptPath, mixedTranscriptEntries(50));

    const result = tailTranscript({ transcriptPath, lastN: 50, includeToolEvents: true });

    expect(result).toHaveLength(50);
    expect(result.some((turn) => turn.type === 'tool_use')).toBe(true);
    expect(result.some((turn) => turn.type === 'tool_result')).toBe(true);
  });

  it('skips malformed final torn lines without warning and warns once for malformed interior lines', async () => {
    const transcriptPath = path.join(tempRoot, 'torn.jsonl');
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({ type: 'user', seq: 1 }),
        '{"type":"assistant",',
        JSON.stringify({ type: 'assistant', seq: 2 }),
        '{"type":"user",',
      ].join('\n'),
      'utf8',
    );
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(tailTranscript({ transcriptPath, lastN: 5 })).toEqual([
      { type: 'user', seq: 1 },
      { type: 'assistant', seq: 2 },
    ]);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('malformed transcript JSONL line skipped');
  });
});

describe('overview.get_transcript', () => {
  it('resolves sessionId through cached crew discovery and tails the transcript', async () => {
    const context = await createContext();
    const transcriptPath = path.join(context.repoRoot, 'transcripts', 'session-a.jsonl');
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await writeTranscript(transcriptPath, mixedTranscriptEntries(50));
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphState({ 'TASK-1': 'implementing' }));
    await writeManifest(context.config.crewsRoot, 'crew-a', 'members', 'alice', {
      crew: 'crew-a',
      name: 'alice',
      cwd: context.repoRoot,
      startedAt: '2026-05-20T10:00:00.000Z',
      sessionId: 'session-a',
      transcriptPath: 'transcripts/session-a.jsonl',
      lastSummary: 'Working on TASK-1.',
    });

    await expect(getTranscript(context, { sessionId: 'session-a', lastN: 3 })).resolves.toEqual({
      ok: true,
      data: [
        { type: 'user', seq: 45, text: 'entry 45' },
        { type: 'assistant', seq: 46, text: 'entry 46' },
        { type: 'user', seq: 47, text: 'entry 47' },
      ],
    });
  });

  it('finds transcript when snapshot-cached ref lacks transcriptPath but manifest has it', async () => {
    const context = await createContext();
    const transcriptPath = path.join(context.repoRoot, 'transcripts', 'session-b.jsonl');
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await writeTranscript(transcriptPath, mixedTranscriptEntries(10));
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-2' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphStateWithSessions({ 'TASK-2': 'implementing' }, [
      { crewName: 'crew-b', memberName: 'bob', startedAt: '2026-05-20T10:00:00.000Z', sessionId: 'session-b' },
    ]));
    await writeManifest(context.config.crewsRoot, 'crew-b', 'members', 'bob', {
      crew: 'crew-b',
      name: 'bob',
      cwd: context.repoRoot,
      startedAt: '2026-05-20T10:00:00.000Z',
      sessionId: 'session-b',
      lastSummary: 'Working on TASK-2.',
      transcriptPath: 'transcripts/session-b.jsonl',
    });

    await expect(getTranscript(context, { sessionId: 'session-b', lastN: 2 })).resolves.toMatchObject({
      ok: true,
      data: expect.arrayContaining([expect.objectContaining({ type: expect.any(String) })]),
    });
  });

  it('returns ok:false when transcript file is missing (ENOENT)', async () => {
    const context = await createContext();
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphState({ 'TASK-1': 'implementing' }));
    await writeManifest(context.config.crewsRoot, 'crew-a', 'members', 'alice', {
      crew: 'crew-a',
      name: 'alice',
      cwd: context.repoRoot,
      startedAt: '2026-05-20T10:00:00.000Z',
      sessionId: 'session-missing',
      transcriptPath: 'transcripts/does-not-exist.jsonl',
      lastSummary: 'Working on TASK-1.',
    });

    const result = await getTranscript(context, { sessionId: 'session-missing' });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/failed to read transcript/);
  });

  it('returns session not found for an unknown sessionId', async () => {
    const context = await createContext();
    await writeOverviewData(context.config.dataFile, { tasks: [{ id: 'TASK-1' }] });
    await writeRalphState(context.config.outputs.sidecarJson, ralphState({ 'TASK-1': 'implementing' }));

    await expect(getTranscript(context, { sessionId: 'missing-session' })).resolves.toEqual({
      ok: false,
      error: 'session not found',
    });
  });
});

function mixedTranscriptEntries(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, seq) => {
    if (seq % 5 === 3) {
      return { type: 'tool_use', seq, name: 'Bash' };
    }
    if (seq % 5 === 4) {
      return { type: 'tool_result', seq, content: 'ok' };
    }
    return { type: seq % 2 === 0 ? 'assistant' : 'user', seq, text: `entry ${seq}` };
  });
}

async function createContext(name = 'repo'): Promise<ServerContext> {
  const repoRoot = path.join(tempRoot, name);
  const config = await writeFixtureConfig(repoRoot);
  reader = new SnapshotReader(config);
  return { repoRoot, config, snapshotReader: reader, processManager: new ProcessManager() };
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

function ralphStateWithSessions(
  stages: Record<string, OverviewRalphState['byTaskId'][string]['stage']>,
  sessions: Array<{ crewName: string; memberName: string; startedAt: string; sessionId?: string }>,
): OverviewRalphState {
  const [[taskId, stage]] = Object.entries(stages);
  return {
    generatedAt: '2026-05-20T10:00:00.000Z',
    generatedFromCommit: 'fixture',
    byTaskId: {
      [taskId]: {
        stage,
        crewSessions: { [stage]: sessions.map(({ crewName, memberName, startedAt, sessionId }) => ({ crewName, memberName, startedAt, ...(sessionId ? { sessionId } : {}) })) },
      },
    },
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

async function writeTranscript(filePath: string, entries: Array<Record<string, unknown>>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
}
