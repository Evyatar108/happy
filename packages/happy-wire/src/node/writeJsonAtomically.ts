import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyOwnerOnlyPerms } from './applyOwnerOnlyPerms';

async function assertNoSymlinkInAncestors(dir: string): Promise<void> {
    const resolved = path.resolve(dir);
    const parsed = path.parse(resolved);
    const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
    let current = parsed.root;
    for (const segment of segments) {
        current = path.join(current, segment);
        try {
            const stats = await fs.lstat(current);
            if (stats.isSymbolicLink()) {
                throw new Error(`atomic_write_aborted_symlink_at:${current}`);
            }
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return;
            throw error;
        }
    }
}

async function replaceFile(tempPath: string, filePath: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            await fs.rename(tempPath, filePath);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (process.platform !== 'win32' || (code !== 'EEXIST' && code !== 'EPERM') || attempt === 4) {
                throw error;
            }
            await fs.rm(filePath, { force: true });
        }
    }
}

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await assertNoSymlinkInAncestors(dir);
    await fs.mkdir(dir, { recursive: true });
    const realDir = await fs.realpath(dir);
    if (path.resolve(realDir) !== path.resolve(dir)) {
        throw new Error(`atomic_write_aborted_realpath_mismatch:${dir}`);
    }
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await replaceFile(tempPath, filePath);
        await applyOwnerOnlyPerms(filePath).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        });
    } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}
