import { spawn } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cwdHash,
    deleteDiscovery,
    deleteDiscoveryIfMatches,
    discoveryFilePath,
    DISCOVERY_FILE_VERSION,
    isPidAlive,
    lockFilePath,
    readDiscoveryRecord,
    type CodexDiscoveryRecord,
    writeDiscoveryRecord,
} from './codexAppServerDiscovery';

const { mockConfiguration } = vi.hoisted(() => ({
    mockConfiguration: {
        happyHomeDir: '',
    },
}));

vi.mock('@/configuration', () => ({
    configuration: mockConfiguration,
}));

function testRecord(overrides: Partial<CodexDiscoveryRecord> = {}): CodexDiscoveryRecord {
    return {
        version: DISCOVERY_FILE_VERSION,
        pid: 1234,
        port: 4321,
        startedAt: '2026-05-07T12:00:00.000Z',
        happyCliVersion: '1.2.3-test',
        cwd: '/tmp/project',
        capabilityToken: 'raw-token',
        capabilityTokenSha256: 'a'.repeat(64),
        transport: 'ws',
        ...overrides,
    };
}

async function exitedChildPid(): Promise<number> {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const pid = child.pid;
    if (pid === undefined) {
        throw new Error('child pid missing');
    }
    await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => resolve());
    });
    return pid;
}

describe('codex app-server discovery paths', () => {
    let tempRoot: string;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'happy-codex-discovery-'));
        mockConfiguration.happyHomeDir = join(tempRoot, 'happy-home');
        mkdirSync(mockConfiguration.happyHomeDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('exports the discovery record shape', () => {
        const record: CodexDiscoveryRecord = testRecord({ cwd: tempRoot });

        expect(record.version).toBe(1);
        expect(record.transport).toBe('ws');
    });

    it('returns a stable full SHA-256 hex hash for the real cwd', () => {
        const projectDir = join(tempRoot, 'project');
        mkdirSync(projectDir);

        const first = cwdHash(projectDir);
        const second = cwdHash(projectDir);

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    it('collapses symlink-equivalent cwd paths to the same hash', () => {
        const realDir = join(tempRoot, 'real-project');
        const linkedDir = join(tempRoot, 'linked-project');
        mkdirSync(realDir);
        symlinkSync(realDir, linkedDir, process.platform === 'win32' ? 'junction' : 'dir');

        expect(cwdHash(linkedDir)).toBe(cwdHash(realDir));
    });

    it('reads happyHomeDir at call-time when building discovery and lock paths', () => {
        const projectDir = join(tempRoot, 'project');
        mkdirSync(projectDir);

        const firstHome = join(tempRoot, 'first-home');
        const secondHome = join(tempRoot, 'second-home');

        mockConfiguration.happyHomeDir = firstHome;
        const firstDiscoveryPath = discoveryFilePath(projectDir);
        const firstLockPath = lockFilePath(projectDir);

        mockConfiguration.happyHomeDir = secondHome;
        const secondDiscoveryPath = discoveryFilePath(projectDir);
        const secondLockPath = lockFilePath(projectDir);

        expect(firstDiscoveryPath.startsWith(firstHome)).toBe(true);
        expect(firstLockPath).toBe(`${firstDiscoveryPath}.lock`);
        expect(secondDiscoveryPath.startsWith(secondHome)).toBe(true);
        expect(secondLockPath).toBe(`${secondDiscoveryPath}.lock`);
    });

    it('reads valid discovery records and returns null for missing, malformed, or version-mismatched files', () => {
        const path = join(mockConfiguration.happyHomeDir, 'codex-active-test.json');
        const record = testRecord();

        expect(readDiscoveryRecord(path)).toBeNull();

        writeFileSync(path, '{not-json');
        expect(readDiscoveryRecord(path)).toBeNull();

        writeFileSync(path, JSON.stringify({ ...record, version: 2 }));
        expect(readDiscoveryRecord(path)).toBeNull();

        writeFileSync(path, JSON.stringify(record));
        expect(readDiscoveryRecord(path)).toEqual(record);
    });

    it('writes discovery records atomically and restricts POSIX file mode to 0600', () => {
        const path = discoveryFilePath(tempRoot);
        const record = testRecord({ cwd: tempRoot });

        writeDiscoveryRecord(path, record);

        expect(readDiscoveryRecord(path)).toEqual(record);
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(record);
        expect(readdirSync(mockConfiguration.happyHomeDir).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
        if (process.platform !== 'win32') {
            expect(statSync(path).mode & 0o777).toBe(0o600);
        }
    });

    it('only deletes a discovery record when the identity tuple matches', () => {
        const path = discoveryFilePath(tempRoot);
        const oldRecord = testRecord({ pid: 1111, startedAt: '2026-05-07T12:00:00.000Z' });
        const newRecord = testRecord({ pid: 2222, startedAt: '2026-05-07T12:01:00.000Z' });

        writeDiscoveryRecord(path, oldRecord);
        writeDiscoveryRecord(path, newRecord);

        deleteDiscoveryIfMatches(path, { pid: oldRecord.pid, startedAt: oldRecord.startedAt });
        expect(readDiscoveryRecord(path)).toEqual(newRecord);

        deleteDiscoveryIfMatches(path, { pid: newRecord.pid, startedAt: newRecord.startedAt });
        expect(existsSync(path)).toBe(false);
    });

    it('unconditionally deletes a discovery record when present', () => {
        const path = discoveryFilePath(tempRoot);

        writeDiscoveryRecord(path, testRecord());
        deleteDiscovery(path);

        expect(existsSync(path)).toBe(false);
        expect(() => deleteDiscovery(path)).not.toThrow();
    });

    it('detects the current process as alive and an exited child PID as dead', async () => {
        expect(isPidAlive(process.pid)).toBe(true);

        const deadPid = await exitedChildPid();

        expect(isPidAlive(deadPid)).toBe(false);
    });
});
