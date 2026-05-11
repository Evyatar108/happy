import { describe, expect, it, vi } from 'vitest';

import { DevTunnelsDaemonProvider } from './devTunnelsDaemonProvider';
import type { CommandRunner } from './tunnelManager';
import type { TunnelConfig } from './types';

describe('DevTunnelsDaemonProvider', () => {
  const config: TunnelConfig = {
    tunnelId: 'happy-test-machine',
    tunnelName: 'happy-test-machine',
    tunnelUrl: 'https://happy-test-machine.devtunnels.ms',
    createdAt: '2026-05-11T12:00:00.000Z',
  };

  it('creates, labels, and starts a host tunnel through TunnelManager', async () => {
    const manager = {
      init: vi.fn().mockResolvedValue(config),
      loadForDaemon: vi.fn(),
      startHost: vi.fn(),
      stop: vi.fn(),
    };
    const calls: string[][] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const provider = new DevTunnelsDaemonProvider({ manager, runner });

    const result = await provider.createHostTunnel({
      port: 62000,
      machineId: 'machine-123',
      extraTags: ['desktop'],
    });

    expect(result).toBe(config);
    expect(manager.init).toHaveBeenCalledWith('machine-123', 62000);
    expect(manager.startHost).toHaveBeenCalledWith(config, 62000);
    expect(calls).toContainEqual([
      'devtunnel',
      'update',
      'happy-test-machine',
      '--labels',
      'happy-machine,machineId:machine-123,desktop',
    ]);
  });

  it('loads and starts an existing tunnel for daemon startup without changing TunnelManager port flags', async () => {
    const manager = {
      init: vi.fn(),
      loadForDaemon: vi.fn().mockResolvedValue(config),
      startHost: vi.fn(),
      stop: vi.fn(),
    };
    const provider = new DevTunnelsDaemonProvider({ manager });

    await provider.loadHostTunnel({ port: 62001 });

    expect(manager.loadForDaemon).toHaveBeenCalledWith(62001);
    expect(manager.startHost).toHaveBeenCalledWith(config, 62001);
  });
});
