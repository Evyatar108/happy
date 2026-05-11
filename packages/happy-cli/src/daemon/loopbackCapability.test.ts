import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('writeLoopbackCapability — symlink/realpath hardening (F-S007)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'happy-loopback-sym-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('throws loopback_capability_aborted_symlink_at when the happyHomeDir itself is a symlink', async () => {
    const realDir = await mkdtemp(path.join(os.tmpdir(), 'happy-real-home-'));
    const symlinkDir = path.join(tmpDir, 'sym-home');

    try {
      await symlink(realDir, symlinkDir, 'junction');
    } catch {
      await symlink(realDir, symlinkDir);
    }

    expect(() => writeLoopbackCapability(symlinkDir)).toThrow(
      /^loopback_capability_aborted_symlink_at:/,
    );

    await rm(realDir, { recursive: true, force: true });
  });

  it('throws loopback_capability_aborted_symlink_at when an ancestor of happyHomeDir is a symlink', async () => {
    const realBase = await mkdtemp(path.join(os.tmpdir(), 'happy-real-base-'));
    const symlinkAncestor = path.join(tmpDir, 'ancestor-sym');

    try {
      await symlink(realBase, symlinkAncestor, 'junction');
    } catch {
      await symlink(realBase, symlinkAncestor);
    }

    // Make a real subdir under the real base so writeLoopbackCapability's dir exists.
    const childUnderSym = path.join(symlinkAncestor, 'child');
    mkdirSync(childUnderSym, { recursive: true });

    expect(() => writeLoopbackCapability(childUnderSym)).toThrow(
      /^loopback_capability_aborted_symlink_at:/,
    );

    await rm(realBase, { recursive: true, force: true });
  });
});
