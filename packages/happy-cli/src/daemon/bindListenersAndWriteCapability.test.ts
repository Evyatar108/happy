import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindListenersAndWriteCapability } from './bindListenersAndWriteCapability';
import { loopbackCapabilityPath } from './loopbackCapability';
import type { DaemonTunnelProvider } from '@/tunnel/provider';

describe('bindListenersAndWriteCapability', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tmpDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not write loopback-cap.txt when listener binding fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'happy-bind-cap-'));
    tmpDirs.push(dir);
    const tunnelProvider: DaemonTunnelProvider = {
      loadHostTunnel: vi.fn().mockResolvedValue({
        tunnelId: 'happy-machine-1',
        tunnelName: 'happy-machine-1',
        tunnelUrl: 'https://happy-machine-1.devtunnels.ms',
        createdAt: '2026-05-11T12:00:00.000Z',
      }),
      createHostTunnel: vi.fn(),
      stop: vi.fn(),
    };
    const first = { app: {} as any, eventRouter: {}, start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) };
    const second = { app: {} as any, eventRouter: {}, start: vi.fn().mockRejectedValue(new Error('EADDRINUSE')), stop: vi.fn().mockResolvedValue(undefined) };
    const createAppFactory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    await expect(bindListenersAndWriteCapability({
      sharedContext: { dataDir: dir, machineKey: 'machine-key', localUserId: 'machine-1' },
      tunnelProvider,
      paths: {
        profile: path.join(dir, 'profile.json'),
        accountSettings: path.join(dir, 'account-settings.json'),
        loopbackCap: loopbackCapabilityPath(dir),
      },
      machineState: () => ({ machineId: 'machine-1', tunnelPort: 62000, loopbackPort: 62000, tunnelId: '', lastTunnelUrl: null }),
      createAppFactory,
    }, dir)).rejects.toThrow('EADDRINUSE');

    expect(existsSync(loopbackCapabilityPath(dir))).toBe(false);
  });
});
