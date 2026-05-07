import { createHash } from 'node:crypto';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { configuration } from '@/configuration';
import { z } from 'zod';

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

const CodexDiscoveryRecordSchema = z.object({
    version: z.literal(DISCOVERY_FILE_VERSION),
    pid: z.number().int().positive(),
    port: z.number().int().positive(),
    startedAt: z.string(),
    happyCliVersion: z.string(),
    cwd: z.string(),
    capabilityToken: z.string(),
    capabilityTokenSha256: z.string(),
    transport: z.literal('ws'),
}).strict();

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

export function readDiscoveryRecord(path: string): CodexDiscoveryRecord | null {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        const result = CodexDiscoveryRecordSchema.safeParse(parsed);
        return result.success ? result.data : null;
    } catch {
        return null;
    }
}

export function writeDiscoveryRecord(path: string, record: CodexDiscoveryRecord): void {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    const tmpPath = join(dir, `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);

    try {
        writeFileSync(tmpPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
        if (process.platform !== 'win32') {
            chmodSync(tmpPath, 0o600);
        }
        renameSync(tmpPath, path);
    } catch (error) {
        try {
            unlinkSync(tmpPath);
        } catch {
            // Best-effort cleanup; preserve the original write/rename failure.
        }
        throw error;
    }
}

export function deleteDiscoveryIfMatches(path: string, identity: Pick<CodexDiscoveryRecord, 'pid' | 'startedAt'>): void {
    const record = readDiscoveryRecord(path);
    if (record?.pid === identity.pid && record.startedAt === identity.startedAt) {
        unlinkSync(path);
    }
}

export function deleteDiscovery(path: string): void {
    if (existsSync(path)) {
        unlinkSync(path);
    }
}

export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code !== 'ESRCH' && code !== 'EINVAL';
    }
}
