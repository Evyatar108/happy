import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { ProcessManager } from '../process-manager.js';

describe('MCP shutdown process cleanup', () => {
  it('stops long-lived and transient real node children through ProcessManager.stopAll', async () => {
    const manager = new ProcessManager();
    const script = 'setInterval(() => {}, 1000)';

    const devServer = manager.spawn({ name: 'dev-server', cmd: 'node', args: ['-e', script] });
    const build = manager.spawn({ name: 'build', cmd: 'node', args: ['-e', script], oneShot: true });
    const syncNow = manager.spawn({ name: 'sync-now', cmd: 'node', args: ['-e', script], oneShot: true });

    const pids = [devServer.pid, build.pid, syncNow.pid].filter((pid): pid is number => typeof pid === 'number');
    expect(pids).toHaveLength(3);
    expect((manager.status() as Array<{ name: string }>).map((entry) => entry.name).sort()).toEqual([
      'build',
      'dev-server',
      'sync-now',
    ]);

    const stopped = await manager.stopAll({ timeoutMs: 2_000 });

    expect(stopped.map((entry) => entry.name).sort()).toEqual(['build', 'dev-server', 'sync-now']);
    expect(manager.status()).toEqual([]);
    for (const pid of pids) {
      await expectPidGone(pid);
    }
  }, 15_000);
});

async function expectPidGone(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      expect(isPidAlive(pid)).toBe(false);
      return;
    }
    await delay(100);
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
