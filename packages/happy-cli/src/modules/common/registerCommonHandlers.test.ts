import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RpcHandler } from '@/api/rpc/types';
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager';
import { registerCommonHandlers } from './registerCommonHandlers';

interface WriteFileRequest {
    path: string;
    content: string;
    expectedHash?: string | null;
    createParents?: boolean;
}

interface WriteFileResponse {
    success: boolean;
    hash?: string;
    error?: string;
}

class TestRpcHandlerManager {
    readonly handlers = new Map<string, RpcHandler>();

    registerHandler<TRequest = any, TResponse = any>(method: string, handler: RpcHandler<TRequest, TResponse>): void {
        this.handlers.set(method, handler as RpcHandler);
    }
}

function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'happy-write-file-'));
}

function getWriteFileHandler(workingDir: string): RpcHandler<WriteFileRequest, WriteFileResponse> {
    const manager = new TestRpcHandlerManager();
    registerCommonHandlers(manager as unknown as RpcHandlerManager, workingDir);
    const handler = manager.handlers.get('writeFile') as RpcHandler<WriteFileRequest, WriteFileResponse> | undefined;
    if (!handler) {
        throw new Error('writeFile handler was not registered');
    }
    return handler;
}

describe('registerCommonHandlers writeFile', () => {
    it('preserves ENOENT behavior when createParents is false', async () => {
        const workingDir = makeTempDir();
        try {
            const writeFile = getWriteFileHandler(workingDir);

            const result = await writeFile({
                path: '.happy/attachments/local-id/file.txt',
                content: Buffer.from('hello').toString('base64'),
                expectedHash: null,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('ENOENT');
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
        }
    });

    it('creates missing parents under the attachments allowlist when createParents is true', async () => {
        const workingDir = makeTempDir();
        try {
            mkdirSync(join(workingDir, '.happy', 'attachments'), { recursive: true });
            const writeFile = getWriteFileHandler(workingDir);

            const result = await writeFile({
                path: '.happy/attachments/local-id/file.txt',
                content: Buffer.from('hello').toString('base64'),
                expectedHash: null,
                createParents: true,
            });

            expect(result.success).toBe(true);
            expect(readFileSync(join(workingDir, '.happy', 'attachments', 'local-id', 'file.txt'), 'utf8')).toBe('hello');
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
        }
    });

    it('rejects createParents outside the attachments allowlist', async () => {
        const workingDir = makeTempDir();
        try {
            const writeFile = getWriteFileHandler(workingDir);

            const result = await writeFile({
                path: 'src/file.txt',
                content: Buffer.from('hello').toString('base64'),
                expectedHash: null,
                createParents: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('.happy/attachments');
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
        }
    });

    it('rejects symlink escapes inside the attachments allowlist', async () => {
        const workingDir = makeTempDir();
        const elsewhere = makeTempDir();
        try {
            mkdirSync(join(workingDir, '.happy', 'attachments'), { recursive: true });
            symlinkSync(elsewhere, join(workingDir, '.happy', 'attachments', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
            const writeFile = getWriteFileHandler(workingDir);

            const result = await writeFile({
                path: '.happy/attachments/escape/file.txt',
                content: Buffer.from('hello').toString('base64'),
                expectedHash: null,
                createParents: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('symbolic link');
            expect(existsSync(join(elsewhere, 'file.txt'))).toBe(false);
        } finally {
            rmSync(workingDir, { recursive: true, force: true });
            rmSync(elsewhere, { recursive: true, force: true });
        }
    });
});
