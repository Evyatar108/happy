import type { TunnelConfig } from './types';

export type CreateHostTunnelOptions = {
  port: number;
  machineId: string;
  extraTags?: string[];
};

export type LoadHostTunnelOptions = {
  port: number;
  extraTags?: string[];
};

export interface DaemonTunnelProvider {
  createHostTunnel(options: CreateHostTunnelOptions): Promise<TunnelConfig>;
  loadHostTunnel(options: LoadHostTunnelOptions): Promise<TunnelConfig>;
  stop(): void;
}
