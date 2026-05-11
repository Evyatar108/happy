import * as fs from "fs/promises";
import * as path from "path";

/**
 * Walk every ancestor of `dir` and throw if any segment is a symlink.
 * Stops early on ENOENT (directory does not yet exist — mkdir will create it).
 */
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
            if (code === "ENOENT") return;
            throw error;
        }
    }
}

/**
 * Write `value` as pretty-printed JSON to `filePath` atomically (tmp + rename),
 * with mode 0o600 and symlink/realpath confinement.
 */
export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await assertNoSymlinkInAncestors(dir);
    await fs.mkdir(dir, { recursive: true });
    const realDir = await fs.realpath(dir);
    if (path.resolve(realDir) !== path.resolve(dir)) {
        throw new Error(`atomic_write_aborted_realpath_mismatch:${dir}`);
    }
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(tempPath, filePath);
        if (process.platform !== "win32") {
            await fs.chmod(filePath, 0o600);
        }
    } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}
