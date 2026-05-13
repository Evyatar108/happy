import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DevTunnelsDaemonProvider } from './devTunnelsDaemonProvider';
import type { CommandRunner } from './tunnelManager';
import type { TunnelConfig } from './types';

// Hoisted mock: intercepts the `spawnSync` used by defaultRunner so tests that omit
// a custom runner can assert applyTags executed without spawning real processes.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawnSync: vi.fn() };
});

describe('DevTunnelsDaemonProvider', () => {
  const config: TunnelConfig = {
    tunnelId: 'happy-test-machine',
    tunnelName: 'happy-test-machine',
    tunnelUrl: 'https://happy-test-machine.devtunnels.ms',
    createdAt: '2026-05-11T12:00:00.000Z',
  };

  const successfulSpawnResult = {
    status: 0,
    stdout: '',
    stderr: '',
    pid: 0,
    output: [],
    signal: null,
    error: undefined,
  };

  beforeEach(async () => {
    const { spawnSync } = await import('node:child_process');
    vi.mocked(spawnSync).mockReturnValue(successfulSpawnResult as ReturnType<typeof spawnSync>);
  });

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
    expect(manager.init).toHaveBeenCalledWith(62000);
    expect(manager.startHost).toHaveBeenCalledWith(config, 62000);
    expect(calls).toContainEqual([
      'devtunnel',
      'update',
      'happy-test-machine',
      '--add-labels',
      'happy-machine,machineId:machine-123,desktop',
    ]);
  });

  it('applies happy-machine label via defaultRunner when only manager is supplied — production daemon path', async () => {
    // Regression guard: pre-fix the constructor set runner=undefined when manager was provided,
    // causing applyTags to return early. Post-fix, defaultRunner is always wired so applyTags runs.
    const { spawnSync } = await import('node:child_process');
    const spawnSyncMock = vi.mocked(spawnSync);

    const manager = {
      init: vi.fn().mockResolvedValue(config),
      loadForDaemon: vi.fn(),
      startHost: vi.fn(),
      stop: vi.fn(),
    };
    const provider = new DevTunnelsDaemonProvider({ manager });
    await provider.createHostTunnel({ port: 62002, machineId: 'machine-456' });

    const labelCall = spawnSyncMock.mock.calls.find(
      ([cmd, args]) => cmd === 'devtunnel' && Array.isArray(args) && (args as string[]).includes('update'),
    );
    expect(labelCall).toBeDefined();
    expect(labelCall?.[1]).toEqual(['update', 'happy-test-machine', '--add-labels', 'happy-machine,machineId:machine-456']);
  });

  it('rejects machineId with invalid characters before invoking spawnSync', async () => {
    const manager = {
      init: vi.fn().mockResolvedValue(config),
      loadForDaemon: vi.fn(),
      startHost: vi.fn(),
      stop: vi.fn(),
    };
    const runnerCalls: string[][] = [];
    const runner: CommandRunner = (command, args) => {
      runnerCalls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const provider = new DevTunnelsDaemonProvider({ manager, runner });

    await expect(
      provider.createHostTunnel({ port: 62003, machineId: 'evil; rm -rf /' }),
    ).rejects.toThrow(/invalid characters/);
    expect(runnerCalls).toEqual([]);
  });

  it('rejects extra label values with invalid characters before invoking spawnSync', async () => {
    const manager = {
      init: vi.fn().mockResolvedValue(config),
      loadForDaemon: vi.fn(),
      startHost: vi.fn(),
      stop: vi.fn(),
    };
    const runnerCalls: string[][] = [];
    const runner: CommandRunner = (command, args) => {
      runnerCalls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const provider = new DevTunnelsDaemonProvider({ manager, runner });

    await expect(
      provider.createHostTunnel({ port: 62004, machineId: 'machine-789', extraTags: ['bad value!'] }),
    ).rejects.toThrow(/invalid characters/);
    expect(runnerCalls).toEqual([]);
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
