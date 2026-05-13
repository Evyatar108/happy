import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
async function applyOwnerOnlyPerms(filePath) {
  if (process.platform !== "win32") {
    await fs.chmod(filePath, 384);
    return;
  }
  try {
    await execFileAsync("icacls", [
      filePath,
      "/remove:g",
      "*S-1-1-0",
      "/remove:g",
      "BUILTIN\\Users",
      "/remove:g",
      "Authenticated Users"
    ]);
    await execFileAsync("icacls", [filePath, "/inheritance:r", "/grant:r", `${userInfo().username}:(R,W)`]);
  } catch (err) {
    throw new Error(`applyOwnerOnlyPerms: failed to set owner-only ACL on "${filePath}": ${err}`);
  }
}

async function assertNoSymlinkInAncestors(dir) {
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
      const code = error.code;
      if (code === "ENOENT") return;
      throw error;
    }
  }
}
async function replaceFile(tempPath, filePath) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      const code = error.code;
      if (process.platform !== "win32" || code !== "EEXIST" && code !== "EPERM" || attempt === 4) {
        throw error;
      }
      await fs.rm(filePath, { force: true });
    }
  }
}
async function writeJsonAtomically(filePath, value) {
  const dir = path.dirname(filePath);
  await assertNoSymlinkInAncestors(dir);
  await fs.mkdir(dir, { recursive: true });
  const realDir = await fs.realpath(dir);
  if (path.resolve(realDir) !== path.resolve(dir)) {
    throw new Error(`atomic_write_aborted_realpath_mismatch:${dir}`);
  }
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}
`, { mode: 384 });
    await replaceFile(tempPath, filePath);
    await applyOwnerOnlyPerms(filePath).catch((error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

export { applyOwnerOnlyPerms, writeJsonAtomically };
