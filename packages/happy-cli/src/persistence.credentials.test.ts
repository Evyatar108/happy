import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPersistenceWithHome(homeDir: string) {
    vi.resetModules();
    vi.doMock('@/configuration', () => ({
        configuration: {
            happyHomeDir: homeDir,
            logsDir: path.join(homeDir, 'logs'),
            settingsFile: path.join(homeDir, 'settings.json'),
            privateKeyFile: path.join(homeDir, 'access.key'),
            daemonStateFile: path.join(homeDir, 'daemon.state.json'),
            machineFile: path.join(homeDir, 'machine.json'),
            isDaemonProcess: false,
        },
    }));
    return await import('./persistence');
}

describe('credentials persistence', () => {
    const tmpDirs: string[] = [];

    afterEach(async () => {
        vi.doUnmock('@/configuration');
        for (const dir of tmpDirs.splice(0)) {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('prefers encryption over legacy secret when both are present', async () => {
        const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-creds-'));
        tmpDirs.push(homeDir);
        const persistence = await loadPersistenceWithHome(homeDir);
        await fs.writeFile(path.join(homeDir, 'access.key'), JSON.stringify({
            token: 'token',
            secret: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
            encryption: {
                publicKey: Buffer.from(new Uint8Array(32).fill(2)).toString('base64'),
                machineKey: Buffer.from(new Uint8Array(32).fill(3)).toString('base64'),
            },
        }));

        await expect(persistence.readCredentials()).resolves.toMatchObject({
            token: 'token',
            encryption: { type: 'dataKey' },
        });
    });

    it('prefers encryption over legacy secret regardless of JSON field order', async () => {
        const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-creds-'));
        tmpDirs.push(homeDir);
        const persistence = await loadPersistenceWithHome(homeDir);
        await fs.writeFile(path.join(homeDir, 'access.key'), JSON.stringify({
            token: 'token',
            encryption: {
                publicKey: Buffer.from(new Uint8Array(32).fill(8)).toString('base64'),
                machineKey: Buffer.from(new Uint8Array(32).fill(9)).toString('base64'),
            },
            secret: Buffer.from(new Uint8Array(32).fill(10)).toString('base64'),
        }));

        await expect(persistence.readCredentials()).resolves.toMatchObject({
            token: 'token',
            encryption: { type: 'dataKey' },
        });
    });

    it('reads legacy-only credentials', async () => {
        const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-creds-'));
        tmpDirs.push(homeDir);
        const persistence = await loadPersistenceWithHome(homeDir);
        await fs.writeFile(path.join(homeDir, 'access.key'), JSON.stringify({
            token: 'token',
            secret: Buffer.from(new Uint8Array(32).fill(4)).toString('base64'),
        }));

        await expect(persistence.readCredentials()).resolves.toMatchObject({
            token: 'token',
            encryption: { type: 'legacy' },
        });
    });

    it('writes new data-key credentials without a secret field', async () => {
        const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-creds-'));
        tmpDirs.push(homeDir);
        const persistence = await loadPersistenceWithHome(homeDir);

        await persistence.writeCredentialsDataKey({
            token: 'token',
            publicKey: new Uint8Array(32).fill(5),
            machineKey: new Uint8Array(32).fill(6),
        });

        const stored = JSON.parse(await fs.readFile(path.join(homeDir, 'access.key'), 'utf-8'));
        expect(stored).toEqual({
            token: 'token',
            encryption: {
                publicKey: Buffer.from(new Uint8Array(32).fill(5)).toString('base64'),
                machineKey: Buffer.from(new Uint8Array(32).fill(6)).toString('base64'),
            },
        });
    });
});
