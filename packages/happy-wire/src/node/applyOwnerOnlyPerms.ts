import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function applyOwnerOnlyPerms(filePath: string): Promise<void> {
    if (process.platform !== 'win32') {
        await fs.chmod(filePath, 0o600);
        return;
    }

    try {
        await execFileAsync('icacls', [filePath, '/inheritance:r', '/grant:r', `${userInfo().username}:(R,W)`]);
    } catch {
        await fs.chmod(filePath, 0o600);
    }
}
