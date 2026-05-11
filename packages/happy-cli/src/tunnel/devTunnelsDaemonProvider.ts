import { spawnSync } from 'node:child_process';

import { TunnelManager, type CommandRunner } from './tunnelManager';
import type { CreateHostTunnelOptions, DaemonTunnelProvider, LoadHostTunnelOptions } from './provider';
import type { TunnelConfig } from './types';

type TunnelManagerLike = Pick<TunnelManager, 'init' | 'loadForDaemon' | 'startHost' | 'stop'>;

export type DevTunnelsDaemonProviderOptions = {
  manager?: TunnelManagerLike;
  runner?: CommandRunner;
};

const DEFAULT_TAGS = ['happy-machine'];

const defaultRunner: CommandRunner = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    windowsHide: true,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error instanceof Error ? result.error.message : ''),
  };
};

function normalizeTags(machineId: string | null, extraTags: string[] | undefined): string[] {
  const tags = [
    ...DEFAULT_TAGS,
    ...(machineId ? [`machineId:${machineId}`] : []),
    ...(extraTags ?? []),
  ];
  return [...new Set(tags.map(tag => tag.trim()).filter(tag => tag.length > 0))];
}

export class DevTunnelsDaemonProvider implements DaemonTunnelProvider {
  private readonly manager: TunnelManagerLike;
  private readonly runner?: CommandRunner;

  constructor(options: DevTunnelsDaemonProviderOptions = {}) {
    this.runner = options.runner ?? (options.manager ? undefined : defaultRunner);
    this.manager = options.manager ?? new TunnelManager({ runner: this.runner });
  }

  async createHostTunnel(options: CreateHostTunnelOptions): Promise<TunnelConfig> {
    const config = await this.manager.init(options.machineId, options.port);
    this.applyTags(config.tunnelId, normalizeTags(options.machineId, options.extraTags));
    this.manager.startHost(config, options.port);
    return config;
  }

  async loadHostTunnel(options: LoadHostTunnelOptions): Promise<TunnelConfig> {
    const config = await this.manager.loadForDaemon(options.port);
    this.applyTags(config.tunnelId, normalizeTags(null, options.extraTags));
    this.manager.startHost(config, options.port);
    return config;
  }

  stop(): void {
    this.manager.stop();
  }

  private applyTags(tunnelId: string, tags: string[]): void {
    if (!this.runner || tags.length === 0) return;

    const result = this.runner('devtunnel', ['update', tunnelId, '--labels', tags.join(',')]);
    if (result.status !== 0) {
      throw new Error(`Failed to apply Dev Tunnel labels to ${tunnelId}: ${result.stderr || result.stdout || 'unknown error'}`);
    }
  }
}
