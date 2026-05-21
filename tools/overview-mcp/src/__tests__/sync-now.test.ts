import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './helpers.js';

const fixtureRoots: string[] = [];
const syncScript = path.join(repoRoot, 'scripts', 'sync-ralph-state.mjs');

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe('overview.sync.now script integration', () => {
  it('spawns the real one-shot sync script and emits a parseable stdout summary', () => {
    const fixture = makeRepoFixture({ taskId: 'sync-summary-task' });

    const result = spawnSync(process.execPath, [syncScript, '--repo', fixture], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const stdoutLines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    expect(stdoutLines).toHaveLength(1);
    expect(stdoutLines[0]).toMatch(/^sync: matched=1, unmatched=0, duration=\d+ms$/);
  });
});

function makeRepoFixture({ taskId }: { taskId: string }): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-sync-now-'));
  fixtureRoots.push(fixture);
  const dirs = ['plans', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms', '.crews/crews', '.crews/sessions-configs'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(fixture, dir), { recursive: true });
  }
  fs.writeFileSync(
    path.join(fixture, 'plans', 'overview-data.js'),
    `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: [{ id: taskId, title: 'Sync summary task' }] }, null, 2)};\n`,
  );
  writeJobState(fixture, taskId, { orchestrator: { phase: '1', terminal: false } });
  return fixture;
}

function writeJobState(fixture: string, taskId: string, value: object): void {
  const jobDir = path.join(fixture, '.ralph', 'jobs', taskId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'job-state.json'), `${JSON.stringify(value, null, 2)}\n`);
}
