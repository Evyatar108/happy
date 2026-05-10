import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validatePath, validatePathRealpath } from './pathSecurity';

describe('validatePath', () => {
    const workingDir = resolve('/home/user/project');

    it('should allow paths within working directory', () => {
        expect(validatePath(resolve('/home/user/project/file.txt'), workingDir)).toEqual({
            valid: true,
            resolvedPath: resolve('/home/user/project/file.txt'),
        });
        expect(validatePath('file.txt', workingDir)).toEqual({
            valid: true,
            resolvedPath: resolve('/home/user/project/file.txt'),
        });
        expect(validatePath('./src/file.txt', workingDir)).toEqual({
            valid: true,
            resolvedPath: resolve('/home/user/project/src/file.txt'),
        });
    });

    it('should reject paths outside working directory', () => {
        const result = validatePath(resolve('/etc/passwd'), workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should prevent path traversal attacks', () => {
        const result = validatePath('../../.ssh/id_rsa', workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should allow the working directory itself', () => {
        expect(validatePath('.', workingDir)).toEqual({
            valid: true,
            resolvedPath: resolve('/home/user/project'),
        });
        expect(validatePath(workingDir, workingDir)).toEqual({
            valid: true,
            resolvedPath: resolve('/home/user/project'),
        });
    });
});

describe('validatePathRealpath', () => {
    function makeTempDir(): string {
        return mkdtempSync(join(tmpdir(), 'happy-path-security-'));
    }

    it('allows missing leaf parents when existing ancestors stay inside the working directory', async () => {
        const workingDir = makeTempDir();
        try {
            mkdirSync(join(workingDir, '.happy', 'attachments'), { recursive: true });

            const result = await validatePathRealpath('.happy/attachments/local-id/file.txt', workingDir);

            expect(result).toEqual({
                valid: true,
                resolvedPath: resolve(workingDir, '.happy/attachments/local-id/file.txt'),
            });
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
        }
    });

    it('rejects a symlink inside the attachments subtree that points outside the working directory', async () => {
        const workingDir = makeTempDir();
        const elsewhere = makeTempDir();
        try {
            mkdirSync(join(workingDir, '.happy', 'attachments'), { recursive: true });
            symlinkSync(elsewhere, join(workingDir, '.happy', 'attachments', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

            const result = await validatePathRealpath('.happy/attachments/escape/file.txt', workingDir);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('symbolic link');
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
            rmSync(elsewhere, { recursive: true, force: true });
        }
    });

    it('rejects a symlink elsewhere under the working directory', async () => {
        const workingDir = makeTempDir();
        const elsewhere = makeTempDir();
        try {
            symlinkSync(elsewhere, join(workingDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

            const result = await validatePathRealpath('escape/file.txt', workingDir);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('symbolic link');
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
            rmSync(elsewhere, { recursive: true, force: true });
        }
    });
});
