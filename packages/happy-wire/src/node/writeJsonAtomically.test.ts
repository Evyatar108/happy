import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeJsonAtomically } from './writeJsonAtomically';

describe('writeJsonAtomically', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-json-atomically-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('writes JSON atomically under a clean directory', async () => {
        const filePath = path.join(tmpDir, 'output.json');
        const value = { hello: 'world', n: 42 };

        await writeJsonAtomically(filePath, value);

        const content = await fs.readFile(filePath, 'utf-8');
        expect(JSON.parse(content)).toEqual(value);
    });

    it('keeps the target parseable during concurrent same-file writes', async () => {
        const filePath = path.join(tmpDir, 'output.json');

        await Promise.all([
            writeJsonAtomically(filePath, { writer: 'a' }),
            writeJsonAtomically(filePath, { writer: 'b' }),
            writeJsonAtomically(filePath, { writer: 'c' }),
        ]);

        const content = await fs.readFile(filePath, 'utf-8');
        expect(['a', 'b', 'c']).toContain(JSON.parse(content).writer);
    });

    it('throws atomic_write_aborted_symlink_at when an ancestor directory is a symlink', async () => {
        const realDir = await fs.mkdtemp(path.join(os.tmpdir(), 'real-dir-'));
        const symlinkDir = path.join(tmpDir, 'symlink-ancestor');

        try {
            await fs.symlink(realDir, symlinkDir, 'junction');
        } catch {
            await fs.symlink(realDir, symlinkDir);
        }

        const filePath = path.join(symlinkDir, 'output.json');

        await expect(writeJsonAtomically(filePath, {})).rejects.toThrow(
            /^atomic_write_aborted_symlink_at:/,
        );

        await fs.rm(realDir, { recursive: true, force: true });
    });

    it('throws atomic_write_aborted_realpath_mismatch when realpath of dir differs from resolved path', async () => {
        const realTarget = await fs.mkdtemp(path.join(os.tmpdir(), 'real-target-'));
        const subDir = path.join(tmpDir, 'sub');
        await fs.mkdir(subDir);
        await fs.rmdir(subDir);

        const intermediateSym = path.join(tmpDir, 'via-sym');
        try {
            await fs.symlink(realTarget, intermediateSym, 'junction');
        } catch {
            await fs.symlink(realTarget, intermediateSym);
        }

        const filePath = path.join(intermediateSym, 'output.json');

        await expect(writeJsonAtomically(filePath, {})).rejects.toThrow(
            /^atomic_write_aborted_symlink_at:|^atomic_write_aborted_realpath_mismatch:/,
        );

        await fs.rm(realTarget, { recursive: true, force: true });
    });

    it('throws atomic_write_aborted_realpath_mismatch specifically for direct-symlink-dir case', async () => {
        const innerReal = path.join(tmpDir, 'inner-real');
        await fs.mkdir(innerReal);

        const innerSym = path.join(tmpDir, 'inner-sym');
        try {
            await fs.symlink(innerReal, innerSym, 'junction');
        } catch {
            await fs.symlink(innerReal, innerSym);
        }

        const filePath = path.join(innerSym, 'file.json');
        await expect(writeJsonAtomically(filePath, {})).rejects.toThrow(
            /^atomic_write_aborted_symlink_at:/,
        );
    });
});
