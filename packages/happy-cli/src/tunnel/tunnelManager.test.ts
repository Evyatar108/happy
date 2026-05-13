import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TunnelManager, writeTunnelConfig, type CommandRunner } from './tunnelManager';

describe('TunnelManager', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempHome(): string {
    const dir = mkdtempSync(join(tmpdir(), 'happy-tunnel-'));
    tempDirs.push(dir);
    return dir;
  }

  it('composes tunnelName as codexu-<hostname> under the 49-char limit', () => {
    const manager = new TunnelManager({ happyHomeDir: tempHome() });
    const name = manager.tunnelName();
    expect(name).toMatch(/^codexu-[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    expect(name.length).toBeLessThanOrEqual(49);
    expect(name.length).toBeGreaterThanOrEqual(8);
  });

  it('renews tunnels older than 25 days', async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const happyHomeDir = tempHome();
    await writeTunnelConfig({
      tunnelId: 'happy-test-machine',
      tunnelName: 'happy-test-machine',
      tunnelUrl: 'https://happy-test-machine.devtunnels.ms',
      createdAt: '2026-04-01T00:00:00.000Z',
    }, happyHomeDir);

    const manager = new TunnelManager({
      happyHomeDir,
      runner,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    });

    await manager.autoRenewIfNeeded({
      tunnelId: 'happy-test-machine',
      tunnelName: 'happy-test-machine',
      tunnelUrl: 'https://happy-test-machine.devtunnels.ms',
      createdAt: '2026-04-01T00:00:00.000Z',
    });

    expect(calls).toContainEqual(['devtunnel', 'update', 'happy-test-machine', '--expiration', '30d']);
  });

  it('does not create a new tunnel when tunnel.json already exists', async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: 'devtunnel version 1.0.1516', stderr: '' };
    };
    const happyHomeDir = tempHome();
    await writeTunnelConfig({
      tunnelId: 'existing-tunnel',
      tunnelName: 'existing-tunnel',
      tunnelUrl: 'https://existing-tunnel.devtunnels.ms',
      createdAt: '2026-05-01T00:00:00.000Z',
    }, happyHomeDir);

    const manager = new TunnelManager({ happyHomeDir, runner });
    const config = await manager.init(62000);

    expect(config.tunnelId).toBe('existing-tunnel');
    expect(calls.some((call) => call[1] === 'create')).toBe(false);
    expect(calls).toContainEqual(['devtunnel', 'port', 'create', 'existing-tunnel', '--port-number', '62000', '--protocol', 'http']);
  });
});
