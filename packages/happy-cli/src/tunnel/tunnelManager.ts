import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { configuration } from '@/configuration';
import { readMachineState, readSettings, writeMachineState } from '@/persistence';
import { logger } from '@/ui/logger';
import { pickFreeLoopbackPort } from '@/utils/pickFreeLoopbackPort';
import { TunnelConfigSchema, type TunnelConfig } from './types';

const REQUIRED_DEVTUNNEL_VERSION = '1.0.1516';
const RENEW_AFTER_DAYS = 25;
const RENEW_WITHIN_EXPIRY_DAYS = 7;
const TUNNEL_LIFETIME_DAYS = 30;

export type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[]) => CommandResult;
export type ProcessSpawner = (command: string, args: string[]) => ChildProcess;

export type TunnelManagerOptions = {
  happyHomeDir?: string;
  runner?: CommandRunner;
  spawner?: ProcessSpawner;
  now?: () => Date;
};

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

const defaultSpawner: ProcessSpawner = (command, args) => spawn(command, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

function compareSemver(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseVersion(output: string): string | null {
  return output.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0] ?? null;
}

function safeTunnelPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseTunnelUrl(output: string, tunnelId: string): string {
  // Prefer the port-specific URL (Microsoft assigns a short id like
  // `58l8c10h-51371.usw2.devtunnels.ms`) so HTTP forwarding hits the right port.
  // Falls back to base tunnel URL or text-extracted URL, then errors out — never
  // silently composes `https://${tunnelId}.devtunnels.ms`, which Microsoft rejects.
  const jsonStart = output.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(output.slice(jsonStart));
      const tunnel = parsed?.tunnel ?? parsed;
      const ports = Array.isArray(tunnel?.ports) ? tunnel.ports : [];
      for (const port of ports) {
        const candidates = [port?.portUri, port?.portForwardingUri, port?.webForwardingUri, port?.url];
        if (Array.isArray(port?.portForwardingUris)) {
          candidates.push(...port.portForwardingUris);
        }
        for (const value of candidates) {
          if (typeof value === 'string' && /^https:\/\//.test(value)) return stripTrailingSlash(value);
        }
      }
      for (const value of [tunnel?.tunnelUri, tunnel?.webForwardingUri, tunnel?.connectUrl, tunnel?.url]) {
        if (typeof value === 'string' && /^https:\/\//.test(value)) return stripTrailingSlash(value);
      }
    } catch {
      // Fall through to text parsing.
    }
  }

  const url = output.match(/https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*-\d+\.[a-z0-9.-]+\.devtunnels\.ms[^\s"']*/)?.[0];
  if (url) return stripTrailingSlash(url);

  throw new Error(`Could not parse a Dev Tunnels port URL for ${tunnelId} from devtunnel output`);
}

function daysBetween(now: Date, then: Date): number {
  return (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000);
}

function daysUntil(now: Date, then: Date): number {
  return (then.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
}

export function getTunnelConfigPath(happyHomeDir = configuration.happyHomeDir): string {
  return join(happyHomeDir, 'tunnel.json');
}

export function readTunnelConfig(happyHomeDir = configuration.happyHomeDir): TunnelConfig | null {
  const configPath = getTunnelConfigPath(happyHomeDir);
  if (!existsSync(configPath)) return null;

  try {
    return TunnelConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch {
    return null;
  }
}

export async function writeTunnelConfig(config: TunnelConfig, happyHomeDir = configuration.happyHomeDir): Promise<void> {
  await mkdir(happyHomeDir, { recursive: true });
  writeFileSync(getTunnelConfigPath(happyHomeDir), JSON.stringify(config, null, 2), 'utf-8');
}

export class TunnelManager {
  private readonly happyHomeDir: string;
  private readonly runner: CommandRunner;
  private readonly spawner: ProcessSpawner;
  private readonly now: () => Date;
  private hostProcess: ChildProcess | null = null;

  constructor(options: TunnelManagerOptions = {}) {
    this.happyHomeDir = options.happyHomeDir ?? configuration.happyHomeDir;
    this.runner = options.runner ?? defaultRunner;
    this.spawner = options.spawner ?? defaultSpawner;
    this.now = options.now ?? (() => new Date());
  }

  tunnelName(): string {
    return `codexu-${safeTunnelPart(os.hostname())}`;
  }

  checkDevTunnelVersion(): { installed: boolean; version: string | null; warning: string | null } {
    const result = this.runner('devtunnel', ['--version']);
    if (result.status !== 0) {
      return {
        installed: false,
        version: null,
        warning: 'devtunnel CLI was not found. Install Microsoft Dev Tunnels CLI before running happy init.',
      };
    }

    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (version && compareSemver(version, REQUIRED_DEVTUNNEL_VERSION) < 0) {
      return {
        installed: true,
        version,
        warning: `devtunnel CLI ${version} is below the required baseline ${REQUIRED_DEVTUNNEL_VERSION}; please upgrade it.`,
      };
    }

    return { installed: true, version, warning: null };
  }

  ensureLoggedIn(): void {
    const current = this.runner('devtunnel', ['user', 'show']);
    if (current.status === 0) return;

    const login = this.runner('devtunnel', ['user', 'login', '-g']);
    if (login.status !== 0) {
      throw new Error(`Dev Tunnels GitHub login failed: ${login.stderr || login.stdout || 'unknown error'}`);
    }
  }

  async init(localPort: number): Promise<TunnelConfig> {
    const version = this.checkDevTunnelVersion();
    if (version.warning) {
      console.warn(version.warning);
    }
    if (!version.installed) {
      throw new Error(version.warning ?? 'devtunnel CLI is required');
    }

    this.ensureLoggedIn();

    const existing = readTunnelConfig(this.happyHomeDir);
    if (existing) {
      await this.ensurePort(existing.tunnelId, localPort);
      // Re-derive the port-specific URL via `devtunnel show --json` so callers
      // never inherit a stale base-tunnel URL from earlier buggy runs.
      const show = this.runner('devtunnel', ['show', existing.tunnelId, '--json']);
      const refreshedUrl = parseTunnelUrl(show.stdout + show.stderr, existing.tunnelId);
      if (refreshedUrl !== existing.tunnelUrl) {
        await writeTunnelConfig({ ...existing, tunnelUrl: refreshedUrl }, this.happyHomeDir);
      }
      await this.persistTunnelUrl(refreshedUrl);
      return { ...existing, tunnelUrl: refreshedUrl };
    }

    const tunnelId = this.tunnelName();
    const create = this.runner('devtunnel', [
      'create',
      tunnelId,
      '--expiration',
      `${TUNNEL_LIFETIME_DAYS}d`,
      '--json',
    ]);
    if (create.status !== 0) {
      throw new Error(`Failed to create Dev Tunnel ${tunnelId}: ${create.stderr || create.stdout || 'unknown error'}`);
    }

    await this.ensurePort(tunnelId, localPort);
    const show = this.runner('devtunnel', ['show', tunnelId, '--json']);
    const tunnelUrl = parseTunnelUrl(`${create.stdout}\n${show.stdout}\n${show.stderr}`, tunnelId);
    const config: TunnelConfig = {
      tunnelId,
      tunnelName: tunnelId,
      tunnelUrl,
      createdAt: this.now().toISOString(),
    };

    await writeTunnelConfig(config, this.happyHomeDir);
    await this.persistTunnelUrl(config.tunnelUrl);
    return config;
  }

  async loadForDaemon(localPort: number): Promise<TunnelConfig> {
    const config = readTunnelConfig(this.happyHomeDir);
    if (!config) {
      throw new Error('Dev Tunnel is not initialized. Run `happy init` before starting the daemon.');
    }

    await this.autoRenewIfNeeded(config);
    await this.ensurePort(config.tunnelId, localPort);
    // Always re-derive the port-specific URL from `devtunnel show --json` so the
    // daemon never publishes a stale base-tunnel URL into `tofuConfig.publicUrl`.
    const show = this.runner('devtunnel', ['show', config.tunnelId, '--json']);
    const refreshedUrl = parseTunnelUrl(show.stdout + show.stderr, config.tunnelId);
    const refreshed = { ...config, tunnelUrl: refreshedUrl };
    if (refreshedUrl !== config.tunnelUrl) {
      await writeTunnelConfig(refreshed, this.happyHomeDir);
    }
    await this.persistTunnelUrl(refreshedUrl);
    return refreshed;
  }

  startHost(config: TunnelConfig, localPort: number): void {
    if (this.hostProcess) return;

    this.hostProcess = this.spawner('devtunnel', ['host', config.tunnelId]);
    this.hostProcess.on('error', (error) => {
      logger.debug(`[TUNNEL] Dev Tunnel host failed for ${config.tunnelId}: ${error.message}`);
    });
    this.hostProcess.on('exit', (code, signal) => {
      logger.debug(`[TUNNEL] Dev Tunnel host exited for ${config.tunnelId}: code=${code}, signal=${signal}`);
      this.hostProcess = null;
    });
    this.hostProcess.unref?.();
    logger.debug(`[TUNNEL] Started Dev Tunnel host for ${config.tunnelId} -> 127.0.0.1:${localPort}`);
  }

  stop(): void {
    if (!this.hostProcess) return;

    try {
      this.hostProcess.kill('SIGTERM');
    } catch {
      // Process may already have exited.
    }
    this.hostProcess = null;
  }

  async autoRenewIfNeeded(config: TunnelConfig): Promise<TunnelConfig> {
    const now = this.now();
    const createdAt = new Date(config.createdAt);
    const refreshedAt = config.refreshedAt ? new Date(config.refreshedAt) : createdAt;
    const expiresAt = new Date(refreshedAt.getTime() + TUNNEL_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
    const shouldRenew = daysBetween(now, refreshedAt) > RENEW_AFTER_DAYS
      || daysUntil(now, expiresAt) < RENEW_WITHIN_EXPIRY_DAYS;

    if (!shouldRenew) return config;

    const daysRemaining = daysUntil(now, expiresAt);
    const refresh = this.runner('devtunnel', ['update', config.tunnelId, '--expiration', `${TUNNEL_LIFETIME_DAYS}d`]);
    if (refresh.status !== 0) {
      if (daysRemaining < 0) {
        throw new Error(`Failed to refresh Dev Tunnel ${config.tunnelId}: ${refresh.stderr || refresh.stdout || 'unknown error'}`);
      }
      logger.warn(`[TUNNEL] Failed to renew Dev Tunnel ${config.tunnelId} (${daysRemaining.toFixed(1)} days remaining): ${refresh.stderr || refresh.stdout || 'unknown error'}. Continuing with existing config.`);
      return config;
    }

    const updated = { ...config, refreshedAt: now.toISOString() };
    await writeTunnelConfig(updated, this.happyHomeDir);
    return updated;
  }

  private async ensurePort(tunnelId: string, localPort: number): Promise<void> {
    const result = this.runner('devtunnel', ['port', 'create', tunnelId, '--port-number', String(localPort), '--protocol', 'http']);
    if (result.status !== 0 && !/already exists|conflict/i.test(`${result.stderr}\n${result.stdout}`)) {
      throw new Error(`Failed to configure Dev Tunnel port ${localPort}: ${result.stderr || result.stdout || 'unknown error'}`);
    }
  }

  private async persistTunnelUrl(tunnelUrl: string): Promise<void> {
    const current = await readMachineState();
    if (!current) return;
    await writeMachineState({ ...current, lastTunnelUrl: tunnelUrl });
  }
}

export async function runInitCommand(): Promise<void> {
  const settings = await readSettings();
  if (!settings.machineId) {
    throw new Error('No machine ID found. Run `happy` once to complete machine setup before `happy init`.');
  }

  let machineState = await readMachineState(settings.machineId);
  if (!machineState) {
    const tunnelPort = await pickFreeLoopbackPort();
    const loopbackPort = await pickFreeLoopbackPort();
    machineState = { machineId: settings.machineId, tunnelPort, loopbackPort, tunnelId: '', lastTunnelUrl: null };
    await writeMachineState(machineState);
  }

  const manager = new TunnelManager();
  const config = await manager.init(machineState.tunnelPort);
  await writeMachineState({
    ...machineState,
    tunnelId: config.tunnelId,
    lastTunnelUrl: config.tunnelUrl,
  });
  console.log(`Dev Tunnel ready: ${config.tunnelUrl}`);
  console.log(`Config written to ${getTunnelConfigPath()}`);
}
