import { describe, expect, it, vi } from 'vitest';

import { dualListenerBinding } from './dualListenerBinding';
import type { DaemonTunnelProvider } from '@/tunnel/provider';
import type { TunnelConfig } from '@/tunnel/types';

describe('dualListenerBinding', () => {
  const tunnelConfig: TunnelConfig = {
    tunnelId: 'happy-machine-1',
    tunnelName: 'happy-machine-1',
    tunnelUrl: 'https://happy-machine-1.devtunnels.ms',
    createdAt: '2026-05-11T12:00:00.000Z',
  };

  it('creates tunnel and loopback apps from one shared context and starts both ports', async () => {
    const tunnelProvider: DaemonTunnelProvider = {
      loadHostTunnel: vi.fn().mockResolvedValue(tunnelConfig),
      createHostTunnel: vi.fn(),
      stop: vi.fn(),
    };
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const createAppFactory = vi.fn(() => ({ app: {} as any, eventRouter: {}, start, stop }));

    const handle = await dualListenerBinding({
      sharedContext: {
        dataDir: '/tmp/happy',
        machineKey: 'machine-key',
        localUserId: 'machine-1',
        tofuPublicKeys: {
          ed25519PublicKey: 'ed25519-public',
          x25519PublicKey: 'x25519-public',
        },
      },
      tunnelProvider,
      paths: {
        profile: '/tmp/happy/profile.json',
        accountSettings: '/tmp/happy/account-settings.json',
        loopbackCap: '/tmp/happy/loopback-cap.txt',
      },
      machineState: () => ({
        machineId: 'machine-1',
        tunnelPort: 62000,
        loopbackPort: 62001,
        tunnelId: 'happy-machine-1',
        lastTunnelUrl: tunnelConfig.tunnelUrl,
      }),
      createAppFactory,
    });

    expect(tunnelProvider.loadHostTunnel).toHaveBeenCalledWith({ port: 62000 });
    expect(createAppFactory).toHaveBeenCalledTimes(2);
    expect(createAppFactory).toHaveBeenNthCalledWith(1, expect.objectContaining({ auth: 'tunnel', port: 62000, publicUrl: tunnelConfig.tunnelUrl }));
    expect(createAppFactory).toHaveBeenNthCalledWith(2, expect.objectContaining({ auth: 'loopback', port: 62001, publicUrl: tunnelConfig.tunnelUrl }));
    expect(start).toHaveBeenCalledTimes(2);

    await handle.stop();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(tunnelProvider.stop).toHaveBeenCalledTimes(1);
  });

  it('stops partial startup when the second listener cannot bind', async () => {
    const tunnelProvider: DaemonTunnelProvider = {
      loadHostTunnel: vi.fn().mockResolvedValue(tunnelConfig),
      createHostTunnel: vi.fn(),
      stop: vi.fn(),
    };
    const first = { app: {} as any, eventRouter: {}, start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) };
    const second = { app: {} as any, eventRouter: {}, start: vi.fn().mockRejectedValue(new Error('EADDRINUSE')), stop: vi.fn().mockResolvedValue(undefined) };
    const createAppFactory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    await expect(dualListenerBinding({
      sharedContext: { dataDir: '/tmp/happy', machineKey: 'machine-key', localUserId: 'machine-1' },
      tunnelProvider,
      paths: { profile: 'profile.json', accountSettings: 'account-settings.json', loopbackCap: 'loopback-cap.txt' },
      machineState: () => ({ machineId: 'machine-1', tunnelPort: 62000, loopbackPort: 62000, tunnelId: '', lastTunnelUrl: null }),
      createAppFactory,
    })).rejects.toThrow('EADDRINUSE');

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(tunnelProvider.stop).toHaveBeenCalledTimes(1);
  });
});
