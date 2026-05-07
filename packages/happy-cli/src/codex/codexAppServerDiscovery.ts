import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { configuration } from '@/configuration';

export const DISCOVERY_FILE_VERSION = 1;

export interface CodexDiscoveryRecord {
    version: typeof DISCOVERY_FILE_VERSION;
    pid: number;
    port: number;
    startedAt: string;
    happyCliVersion: string;
    cwd: string;
    capabilityToken: string;
    capabilityTokenSha256: string;
    transport: 'ws';
}

export function cwdHash(cwd?: string): string {
    const resolvedCwd = realpathSync(cwd ?? process.cwd());
    return createHash('sha256').update(resolvedCwd).digest('hex');
}

export function discoveryFilePath(cwd?: string): string {
    return join(configuration.happyHomeDir, `codex-active-${cwdHash(cwd)}.json`);
}

export function lockFilePath(cwd?: string): string {
    return `${discoveryFilePath(cwd)}.lock`;
}
