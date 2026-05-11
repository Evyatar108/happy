import { randomBytes } from 'node:crypto';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { configuration } from '@/configuration';

export function loopbackCapabilityPath(happyHomeDir = configuration.happyHomeDir): string {
  return join(happyHomeDir, 'loopback-cap.txt');
}

export function writeLoopbackCapability(happyHomeDir = configuration.happyHomeDir): { token: string; path: string } {
  const token = randomBytes(32).toString('base64url');
  const path = loopbackCapabilityPath(happyHomeDir);
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  writeFileSync(tmpPath, `${token}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, path);
  if (process.platform !== 'win32') {
    chmodSync(path, 0o600);
  }

  return { token, path };
}
