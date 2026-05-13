import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    loggerWarn: vi.fn(),
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        warn: mocks.loggerWarn,
    },
}));

import { loadProjectMcpServers } from './projectMcpConfig';

function withTempDir(fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'happy-project-mcp-'));
    try {
        fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
        mocks.loggerWarn.mockReset();
    }
}

function writeMcpConfig(dir: string, value: unknown): void {
    const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    writeFileSync(join(dir, '.mcp.json'), body);
}

describe('loadProjectMcpServers', () => {
    it('loads a valid HTTP entry and strips type', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                paper: { type: 'http', url: 'http://127.0.0.1:29979/mcp' },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({
            paper: { url: 'http://127.0.0.1:29979/mcp' },
        });
    }));

    it('loads a valid stdio entry', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                filesystem: { command: 'node', args: ['server.js'] },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({
            filesystem: { command: 'node', args: ['server.js'] },
        });
    }));

    it('returns empty without logging when .mcp.json is absent', () => withTempDir((dir) => {
        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).not.toHaveBeenCalled();
    }));

    it('warns and returns empty for malformed JSON', () => withTempDir((dir) => {
        writeMcpConfig(dir, '{ not valid json');

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json parse failed', {
            path: join(dir, '.mcp.json'),
            reason: expect.any(String),
        });
    }));

    it('warns and returns empty for an invalid root shape', () => withTempDir((dir) => {
        writeMcpConfig(dir, { servers: {} });

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json root shape invalid', {
            path: join(dir, '.mcp.json'),
            issues: expect.any(Array),
        });
    }));

    it('keeps valid entries when sibling entries are invalid', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                paper: { type: 'http', url: 'http://127.0.0.1:29979/mcp' },
                broken: { args: ['missing-command'] },
                alsoBroken: 'not-an-object',
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({
            paper: { url: 'http://127.0.0.1:29979/mcp' },
        });
        expect(mocks.loggerWarn).toHaveBeenCalledTimes(2);
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json server invalid', {
            path: join(dir, '.mcp.json'),
            serverName: 'broken',
            issues: expect.any(Array),
        });
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json server invalid', {
            path: join(dir, '.mcp.json'),
            serverName: 'alsoBroken',
            issues: expect.any(Array),
        });
    }));

    it('skips an ambiguous entry with both command and url', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                ambiguous: { command: 'node', url: 'http://127.0.0.1:29979/mcp' },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json server invalid', {
            path: join(dir, '.mcp.json'),
            serverName: 'ambiguous',
            issues: expect.arrayContaining([
                expect.objectContaining({
                    code: 'custom',
                    message: 'MCP server entry must specify exactly one transport: command or url',
                }),
            ]),
        });
    }));

    it('skips the reserved happy server name', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                happy: { type: 'http', url: 'http://127.0.0.1:29979/mcp' },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith(
            '[codex] .mcp.json: server name "happy" is reserved for the Happy bridge — entry skipped',
            { path: join(dir, '.mcp.json'), serverName: 'happy' },
        );
    }));

    it.each([
        ['Happy'],
        ['HAPPY'],
        [' happy'],
        ['happy '],
    ])('skips reserved name case-insensitively and trims whitespace: %s', (name) => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                [name]: { type: 'http', url: 'http://127.0.0.1:29979/mcp' },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith(
            '[codex] .mcp.json: server name "happy" is reserved for the Happy bridge — entry skipped',
            { path: join(dir, '.mcp.json'), serverName: name },
        );
    }));

    it('rejects an HTTP entry whose url is not a valid URL', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                paper: { type: 'http', url: 'not-a-url' },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({});
        expect(mocks.loggerWarn).toHaveBeenCalledWith('[codex] .mcp.json server invalid', {
            path: join(dir, '.mcp.json'),
            serverName: 'paper',
            issues: expect.any(Array),
        });
    }));

    it('preserves passthrough fields on valid entries', () => withTempDir((dir) => {
        writeMcpConfig(dir, {
            mcpServers: {
                paper: {
                    type: 'http',
                    url: 'http://127.0.0.1:29979/mcp',
                    http_headers: { 'X-Test': 'true' },
                    bearer_token_env_var: 'PAPER_TOKEN',
                },
            },
        });

        expect(loadProjectMcpServers(dir)).toEqual({
            paper: {
                url: 'http://127.0.0.1:29979/mcp',
                http_headers: { 'X-Test': 'true' },
                bearer_token_env_var: 'PAPER_TOKEN',
            },
        });
    }));
});
