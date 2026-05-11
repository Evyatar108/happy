import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loopbackCapabilityPath, writeLoopbackCapability } from './loopbackCapability';

describe('loopbackCapability', () => {
  it('writes a regenerated 32-byte capability token atomically', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'happy-loopback-cap-'));

    const first = writeLoopbackCapability(dir);
    const second = writeLoopbackCapability(dir);

    expect(first.path).toBe(loopbackCapabilityPath(dir));
    expect(second.path).toBe(first.path);
    expect(first.token).not.toBe(second.token);
    expect(Buffer.from(second.token, 'base64url')).toHaveLength(32);
    await expect(readFile(second.path, 'utf-8')).resolves.toBe(`${second.token}\n`);
    if (process.platform !== 'win32') {
      const mode = (await stat(second.path)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
