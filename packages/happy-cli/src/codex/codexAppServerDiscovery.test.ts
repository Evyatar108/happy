import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cwdHash,
    discoveryFilePath,
    DISCOVERY_FILE_VERSION,
    lockFilePath,
    type CodexDiscoveryRecord,
} from './codexAppServerDiscovery';

const { mockConfiguration } = vi.hoisted(() => ({
    mockConfiguration: {
        happyHomeDir: '',
    },
}));

vi.mock('@/configuration', () => ({
    configuration: mockConfiguration,
}));

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
        const record: CodexDiscoveryRecord = {
            version: DISCOVERY_FILE_VERSION,
            pid: 1234,
            port: 4321,
            startedAt: '2026-05-07T12:00:00.000Z',
            happyCliVersion: '1.2.3-test',
            cwd: tempRoot,
            capabilityToken: 'raw-token',
            capabilityTokenSha256: 'a'.repeat(64),
            transport: 'ws',
        };

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
});
