import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { repoRoot } from './helpers.js';

const runRealVite = process.env.OVERVIEW_MCP_REAL_VITE === '1' && process.platform === 'win32';
const serverEntry = path.join(repoRoot, 'tools', 'overview-mcp', 'dist', 'index.js');

describe.skipIf(!runRealVite)('real Vite shutdown orphan check', () => {
  it('stops dev-server descendants and frees port 5173 when the MCP process receives SIGTERM', async () => {
    const client = await startMcpServer();
    try {
      const started = await client.callTool('overview.dev_server.start', {});
      expect(started).toMatchObject({ ok: true });

      const status = await client.callTool('overview.dev_server.status', {});
      expect(status).toMatchObject({ running: true });
      const devServerPid = status.pid as number;
      const listenerPid = await waitForPortListener(5173);

      client.child.kill('SIGTERM');
      await waitForProcessExit(client.child);
      await waitForPidExit(devServerPid);
      if (listenerPid !== null) {
        await waitForPidExit(listenerPid);
      }
      expect(findPortListenerPid(5173)).toBeNull();
    } finally {
      client.child.kill('SIGKILL');
    }
  }, 90_000);
});

async function startMcpServer(): Promise<{
  child: ChildProcessWithoutNullStreams;
  callTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}> {
  const child = spawn(process.execPath, [serverEntry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, OVERVIEW_MCP_REPO_ROOT: repoRoot },
  });
  let nextId = 1;
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) {
        return;
      }
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) {
        continue;
      }
      const message = JSON.parse(line) as { id?: number; result?: { content?: Array<{ text?: string }> } };
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(JSON.parse(message.result?.content?.[0]?.text ?? '{}') as Record<string, unknown>);
        pending.delete(message.id);
      }
    }
  });

  return {
    child,
    callTool(name, args) {
      const id = nextId++;
      const request = { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
      return new Promise((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify(request)}\n`);
      });
    },
  };
}

async function waitForPortListener(port: number): Promise<number | null> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pid = findPortListenerPid(port);
    if (pid !== null) {
      return pid;
    }
    await delay(250);
  }
  return null;
}

function findPortListenerPid(port: number): number | null {
  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
      continue;
    }
    const pid = Number(line.trim().split(/\s+/).at(-1));
    if (Number.isInteger(pid)) {
      return pid;
    }
  }
  return null;
}

async function waitForProcessExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

async function waitForPidExit(pid: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return;
    }
    await delay(250);
  }
  expect(isPidAlive(pid)).toBe(false);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
