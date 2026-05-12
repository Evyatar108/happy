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
        // Remove pre-existing explicit ACEs for broad-access groups before granting owner-only ACE.
        await execFileAsync('icacls', [
            filePath,
            '/remove:g', '*S-1-1-0',
            '/remove:g', 'BUILTIN\\Users',
            '/remove:g', 'Authenticated Users',
        ]);
        await execFileAsync('icacls', [filePath, '/inheritance:r', '/grant:r', `${userInfo().username}:(R,W)`]);
    } catch (err) {
        throw new Error(`applyOwnerOnlyPerms: failed to set owner-only ACL on "${filePath}": ${err}`);
    }
}
