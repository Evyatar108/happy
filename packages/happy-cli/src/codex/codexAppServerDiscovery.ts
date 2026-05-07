import { createHash } from 'node:crypto';
import {
    chmodSync,
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    realpathSync,
    renameSync,
    unlinkSync,
    writeSync,
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

export type DiscoveryLock = {
    release: () => Promise<void>;
};

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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLockHolderPid(path: string): number | null {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown };
        return typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : null;
    } catch {
        return null;
    }
}

export async function acquireDiscoveryLock(path: string, opts?: { timeoutMs?: number }): Promise<DiscoveryLock> {
    const timeoutMs = opts?.timeoutMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;
    let reclaimedDeadHolder = false;

    while (true) {
        try {
            mkdirSync(dirname(path), { recursive: true });
            const fd = openSync(path, 'wx', 0o600);
            const startedAt = new Date().toISOString();
            writeSync(fd, `${JSON.stringify({ pid: process.pid, startedAt })}\n`);

            let released = false;
            return {
                release: async () => {
                    if (released) return;
                    released = true;
                    closeSync(fd);
                    try {
                        unlinkSync(path);
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                            throw error;
                        }
                    }
                },
            };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'EEXIST') {
                throw error;
            }

            const holderPid = readLockHolderPid(path);
            if (!reclaimedDeadHolder && holderPid !== null && !isPidAlive(holderPid)) {
                reclaimedDeadHolder = true;
                try {
                    unlinkSync(path);
                } catch (unlinkError) {
                    if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw unlinkError;
                    }
                }
                continue;
            }

            if (Date.now() >= deadline) {
                throw new Error(`startup-in-progress: timed out acquiring discovery lock ${path}`);
            }
            await sleep(Math.min(50, Math.max(1, deadline - Date.now())));
        }
    }
}
