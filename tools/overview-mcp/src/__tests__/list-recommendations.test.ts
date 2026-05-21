import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { listRecommendations } from '../tools/read-only.js';

import type { ServerContext } from '../context.js';
import { makeContext, recommendation, setupTempRoot, snapshotWithTasks, writeSnapshot } from './helpers.js';

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
  await readerRef.current?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
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
