import type { CreateAppConfig, HappyServerHandle, HappyServerSharedContext } from 'happy-server';

import type { MachineLocallyPersistedState } from '@/persistence';
import type { DaemonTunnelProvider } from '@/tunnel/provider';
import type { TunnelConfig } from '@/tunnel/types';

type CreateAppFactory = (config: CreateAppConfig) => HappyServerHandle;
type HappyServerModule = { createApp: CreateAppFactory };
const importHappyServer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<HappyServerModule>;

export type DualListenerPaths = {
  profile: string;
  accountSettings: string;
  loopbackCap: string;
};

export type DualListenerBindingOptions = {
  sharedContext: HappyServerSharedContext;
  tunnelProvider: DaemonTunnelProvider;
  paths: DualListenerPaths;
  machineState: () => MachineLocallyPersistedState;
  machineInfo?: {
    hostname: string;
    owner: string;
  };
  createAppFactory?: CreateAppFactory;
};

export type DualListenerBindingHandle = {
  tunnel: HappyServerHandle;
  loopback: HappyServerHandle;
  tunnelConfig: TunnelConfig;
  stop: () => Promise<void>;
};

export async function dualListenerBinding(options: DualListenerBindingOptions): Promise<DualListenerBindingHandle> {
  const state = options.machineState();
  const tunnelConfig = await options.tunnelProvider.loadHostTunnel({ port: state.tunnelPort });
  const create = options.createAppFactory ?? (await importHappyServer('happy-server')).createApp;
  const machineState = () => {
    const current = options.machineState();
    return {
      machineId: current.machineId,
      hostname: options.machineInfo?.hostname ?? current.machineId,
      tunnelPort: current.tunnelPort,
      loopbackPort: current.loopbackPort,
      tunnelUrl: current.lastTunnelUrl ?? tunnelConfig.tunnelUrl,
      lastSeenAt: Date.now(),
      owner: options.machineInfo?.owner ?? current.machineId,
    };
  };
  const shared = {
    ...options.sharedContext,
    publicUrl: tunnelConfig.tunnelUrl,
  };
  const tunnel = create({
    ...shared,
    port: state.tunnelPort,
    auth: 'tunnel',
    paths: options.paths,
    machineState,
  });
  const loopback = create({
    ...shared,
    port: state.loopbackPort,
    auth: 'loopback',
    paths: options.paths,
    machineState,
  });

  try {
    await tunnel.start();
    await loopback.start();
  } catch (error) {
    await Promise.allSettled([tunnel.stop(), loopback.stop()]);
    options.tunnelProvider.stop();
    throw error;
  }

  return {
    tunnel,
    loopback,
    tunnelConfig,
    async stop() {
      await Promise.allSettled([loopback.stop(), tunnel.stop()]);
      options.tunnelProvider.stop();
    },
  };
}
