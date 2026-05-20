import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadOverviewData } from '../../../../scripts/lib/sync-core.mjs';
import { createServer } from '../server.js';
import { SnapshotReader } from '../snapshot-reader.js';
import { setOverride } from '../tools/set-override.js';
import { editOverrides } from '../utils/set-override-edit.js';

import type { ServerContext } from '../context.js';
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs';

const fixturePath = fileURLToPath(new URL('./fixtures/overview-data.sample.js', import.meta.url));

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-set-override-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('overview.set_override registration', () => {
  it('registers the set_override tool', async () => {
    const context = await createContext();
    const server = createServer(context) as unknown as { _registeredTools: Record<string, unknown> };

    expect(server._registeredTools['overview.set_override']).toBeDefined();
  });
});

describe('editOverrides', () => {
  it('inserts ralphOverrides after tasks while preserving bytes outside the insertion range', async () => {
    const source = await fs.readFile(fixturePath, 'utf8');
    const result = editOverrides({ source, slug: 'job-alpha', taskId: 'TASK-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.source).toContain('ralphOverrides: {\n    "job-alpha": "TASK-1",\n  },');
    expect(result.source.indexOf('ralphOverrides')).toBeGreaterThan(result.source.indexOf('tasks:'));
    assertOutsideRangeUnchanged(source, result.source, result.editRange, result.source.length - source.length);
  });

  it('replaces an existing override value while preserving bytes outside the value range', async () => {
    const source = await fs.readFile(fixturePath, 'utf8');
    const inserted = editOverrides({ source, slug: 'job-alpha', taskId: 'TASK-1' });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) {
      return;
    }

    const replaced = editOverrides({ source: inserted.source, slug: 'job-alpha', taskId: 'TASK-2' });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) {
      return;
    }

    expect(replaced.source).toContain('"job-alpha": "TASK-2"');
    assertOutsideRangeUnchanged(inserted.source, replaced.source, replaced.editRange, 0);
  });

  it('returns the original source when the existing override already has the same value', async () => {
    const source = await fs.readFile(fixturePath, 'utf8');
    const inserted = editOverrides({ source, slug: 'job-alpha', taskId: 'TASK-1' });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) {
      return;
    }

    const result = editOverrides({ source: inserted.source, slug: 'job-alpha', taskId: 'TASK-1' });

    expect(result).toEqual({ ok: true, source: inserted.source, editRange: null });
  });

  it('adds a new slug when ralphOverrides exists without that key', async () => {
    const source = 'window.OVERVIEW_DATA = {\n  tasks: [],\n  ralphOverrides: {},\n};\n';
    const result = editOverrides({ source, slug: 'job-alpha', taskId: 'TASK-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.source).toContain('ralphOverrides: {\n    "job-alpha": "TASK-1",\n  },');
  });

  it('returns an error for malformed source', () => {
    expect(editOverrides({ source: 'window.OVERVIEW_DATA = { tasks: [', slug: 'job-alpha', taskId: 'TASK-1' })).toMatchObject({
      ok: false,
    });
  });
});

describe('setOverride', () => {
  it('writes the edited overview-data.js atomically and leaves parseable data', async () => {
    const context = await createContext();
    const source = await fs.readFile(fixturePath, 'utf8');
    await fs.writeFile(context.config.dataFile, source, 'utf8');

    await expect(setOverride(context, { slug: 'job-alpha', taskId: 'TASK-1' })).resolves.toEqual({
      ok: true,
      data: { slug: 'job-alpha', taskId: 'TASK-1' },
    });

    const parsed = loadOverviewData(context.config.dataFile);
    expect(parsed.ralphOverrides).toEqual({ 'job-alpha': 'TASK-1' });
  });

  it('returns an error and does not overwrite when the overview assignment is absent', async () => {
    const context = await createContext('missing-assignment');
    const malformed = 'const data = { tasks: [] };\n';
    await fs.writeFile(context.config.dataFile, malformed, 'utf8');

    await expect(setOverride(context, { slug: 'job-alpha', taskId: 'TASK-1' })).resolves.toEqual({
      ok: false,
      error: 'window.OVERVIEW_DATA assignment not found',
    });
    await expect(fs.readFile(context.config.dataFile, 'utf8')).resolves.toBe(malformed);
  });
});

async function createContext(name = 'repo'): Promise<ServerContext> {
  const repoRoot = path.join(tempRoot, name);
  const config = await writeFixtureConfig(repoRoot);
  return { repoRoot, config, snapshotReader: new SnapshotReader(config) };
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

function assertOutsideRangeUnchanged(
  original: string,
  edited: string,
  range: { start: number; end: number } | null,
  delta: number,
): void {
  expect(range).not.toBeNull();
  if (!range) {
    return;
  }
  expect(Buffer.compare(Buffer.from(original.slice(0, range.start)), Buffer.from(edited.slice(0, range.start)))).toBe(0);
  expect(
    Buffer.compare(Buffer.from(original.slice(range.end)), Buffer.from(edited.slice(range.end + delta))),
  ).toBe(0);
}
