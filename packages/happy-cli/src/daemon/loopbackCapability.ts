import { randomBytes } from 'node:crypto';
import { lstatSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';

import { configuration } from '@/configuration';
import { applyOwnerOnlyPerms } from '@slopus/happy-wire/node';

export function loopbackCapabilityPath(happyHomeDir = configuration.happyHomeDir): string {
  return join(happyHomeDir, 'loopback-cap.txt');
}

function assertNoSymlinkInAncestors(dir: string) {
  const resolved = resolve(dir);
  const parsed = parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`loopback_capability_aborted_symlink_at:${current}`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function writeLoopbackCapability(happyHomeDir = configuration.happyHomeDir): Promise<{ token: string; path: string }> {
  const token = randomBytes(32).toString('base64url');
  const path = loopbackCapabilityPath(happyHomeDir);
  const dir = dirname(path);
  assertNoSymlinkInAncestors(dir);
  const realDir = realpathSync(dir);
  if (resolve(realDir) !== resolve(dir)) {
    throw new Error(`loopback_capability_aborted_realpath_mismatch:${dir}`);
  }
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  writeFileSync(tmpPath, `${token}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, path);
  await applyOwnerOnlyPerms(path);

  return { token, path };
}
