import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..');
const renderRoadmapCli = join(repoRoot, 'tools', 'render-roadmap.ts');

let tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'happy-roadmap-render-'));
  tempRoots.push(root);
  await mkdir(join(root, 'plans'), { recursive: true });
  await writeFile(join(root, 'plans', 'codexu-roadmap.md'), [
    '# Roadmap',
    '',
    '## Ralph Rendered Fan-Out Runs',
    '',
    '<!-- ralph-render-section:start -->',
    '<!-- ralph-render-section:end -->',
    '',
  ].join('\n'), 'utf8');
  return root;
}

async function writeLedger(root: string, runId: string, sessionId: string, records: Array<Record<string, unknown>>): Promise<void> {
  await mkdir(join(root, '.ralph', 'state', runId), { recursive: true });
  await writeFile(
    join(root, '.ralph', 'state', runId, `${sessionId}.jsonl`),
    `${records.map((record) => JSON.stringify({ runId, sessionId, ...record })).join('\n')}\n`,
    'utf8',
  );
}

async function render(root: string, runId: string): Promise<void> {
  await execFileAsync(process.execPath, ['--import', 'tsx', renderRoadmapCli, '--root', root, '--runId', runId], {
    cwd: repoRoot,
  });
}

async function archive(root: string, runId: string): Promise<void> {
  await execFileAsync(process.execPath, ['--import', 'tsx', renderRoadmapCli, '--root', root, '--archive', runId], {
    cwd: repoRoot,
  });
}

describe('render-roadmap CLI', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
    tempRoots = [];
  });

  it('renders the same ledger state byte-identically across repeated runs', async () => {
    const root = await createTempRoot();
    await writeLedger(root, 'run-1', 'session-b', [
      {
        timestamp: '2026-05-10T23:30:02.000Z',
        seqWithinSession: 0,
        eventType: 'done',
        scopeSummary: 'implemented renderer',
        testReference: 'pnpm --filter happy exec vitest run src/roadmap/renderRoadmap.test.ts',
        verificationUrl: 'https://example.com/verify',
        caveats: [],
      },
    ]);
    await writeLedger(root, 'run-1', 'session-a', [
      {
        timestamp: '2026-05-10T23:30:01.000Z',
        seqWithinSession: 1,
        eventType: 'idle-reached',
        queueDepth: 0,
      },
      {
        timestamp: '2026-05-10T23:30:01.000Z',
        seqWithinSession: 0,
        eventType: 'message-sent',
        direction: 'user-to-agent',
        messagePreview: 'start work',
      },
    ]);

    await render(root, 'run-1');
    const first = await readFile(join(root, 'plans', 'codexu-roadmap.md'), 'utf8');
    await render(root, 'run-1');
    const second = await readFile(join(root, 'plans', 'codexu-roadmap.md'), 'utf8');

    expect(second).toBe(first);
    expect(second.indexOf('`message-sent`')).toBeLessThan(second.indexOf('`idle-reached`'));
    expect(second.indexOf('`idle-reached`')).toBeLessThan(second.indexOf('`done`'));
  });

  it('appends new runIds, replaces existing regions in place, and archives rendered regions', async () => {
    const root = await createTempRoot();
    await writeLedger(root, 'run-1', 'session-1', [{
      timestamp: '2026-05-10T23:30:00.000Z',
      eventType: 'spawn',
      agent: 'codex',
      projectPath: '/repo',
      worktreePath: '/repo/.dev/worktree/ralph-12345678',
    }]);
    await writeLedger(root, 'run-2', 'session-2', [{
      timestamp: '2026-05-10T23:31:00.000Z',
      eventType: 'error',
      errorCode: 'crash',
      errorMessage: 'failed',
    }]);

    await render(root, 'run-1');
    await render(root, 'run-2');
    let roadmap = await readFile(join(root, 'plans', 'codexu-roadmap.md'), 'utf8');
    expect(roadmap.indexOf('runId=run-1')).toBeLessThan(roadmap.indexOf('runId=run-2'));

    await writeLedger(root, 'run-1', 'session-3', [{
      timestamp: '2026-05-10T23:32:00.000Z',
      eventType: 'last-output-summary',
      summary: 'updated summary',
      heuristic: 'assistant-text',
    }]);
    await render(root, 'run-1');
    roadmap = await readFile(join(root, 'plans', 'codexu-roadmap.md'), 'utf8');
    expect(roadmap.match(/ralph-render:start runId=run-1/g)).toHaveLength(1);
    expect(roadmap).toContain('updated summary');
    expect(roadmap.indexOf('runId=run-1')).toBeLessThan(roadmap.indexOf('runId=run-2'));

    await archive(root, 'run-1');
    roadmap = await readFile(join(root, 'plans', 'codexu-roadmap.md'), 'utf8');
    expect(roadmap).not.toContain('runId=run-1');
    expect(roadmap).toContain('runId=run-2');
    const archived = await readFile(join(root, '.ralph', 'state', 'archive', 'run-1', 'rendered.md'), 'utf8');
    expect(archived).toContain('runId=run-1');
    expect(archived).toContain('updated summary');
  });
});
