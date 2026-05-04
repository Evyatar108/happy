import { describe, expect, it } from 'vitest';

import { extractCodexResumeFlag, extractCodexTransportFlag } from './cliArgs';

describe('extractCodexResumeFlag', () => {
    it('returns null and preserves args when resume flag is absent', () => {
        const parsed = extractCodexResumeFlag(['--started-by', 'terminal']);

        expect(parsed.resumeThreadId).toBeNull();
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('extracts an explicit resume thread ID', () => {
        const parsed = extractCodexResumeFlag(['--resume', 'thread-123', '--started-by', 'daemon']);

        expect(parsed.resumeThreadId).toBe('thread-123');
        expect(parsed.args).toEqual(['--started-by', 'daemon']);
    });

    it('supports equals syntax', () => {
        const parsed = extractCodexResumeFlag(['--resume=thread-456', '--started-by', 'terminal']);

        expect(parsed.resumeThreadId).toBe('thread-456');
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('throws when resume flag is missing a thread ID', () => {
        expect(() => extractCodexResumeFlag(['--resume'])).toThrow(
            'Codex resume requires a thread ID: happy codex --resume <thread-id>',
        );
    });
});

describe('extractCodexTransportFlag', () => {
    it('returns undefined and preserves args when transport flag is absent', () => {
        const parsed = extractCodexTransportFlag(['--started-by', 'terminal']);

        expect(parsed.transport).toBeUndefined();
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('supports equals syntax for ws', () => {
        const parsed = extractCodexTransportFlag(['--codex-transport=ws', '--started-by', 'terminal']);

        expect(parsed.transport).toBe('ws');
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('supports equals syntax for stdio', () => {
        const parsed = extractCodexTransportFlag(['--codex-transport=stdio', '--started-by', 'terminal']);

        expect(parsed.transport).toBe('stdio');
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('supports space-separated syntax for ws', () => {
        const parsed = extractCodexTransportFlag(['--codex-transport', 'ws', '--started-by', 'terminal']);

        expect(parsed.transport).toBe('ws');
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('supports space-separated syntax for stdio', () => {
        const parsed = extractCodexTransportFlag(['--codex-transport', 'stdio', '--started-by', 'terminal']);

        expect(parsed.transport).toBe('stdio');
        expect(parsed.args).toEqual(['--started-by', 'terminal']);
    });

    it('throws for an invalid transport value', () => {
        expect(() => extractCodexTransportFlag(['--codex-transport=tcp'])).toThrow(
            'Codex transport must be one of: stdio, ws',
        );
    });

    it('throws for an empty transport value', () => {
        expect(() => extractCodexTransportFlag(['--codex-transport='])).toThrow(
            'Codex transport must be one of: stdio, ws',
        );
    });

    it('throws when transport flag is missing a value', () => {
        expect(() => extractCodexTransportFlag(['--codex-transport'])).toThrow(
            'Codex transport requires a value: happy codex --codex-transport <stdio|ws>',
        );
    });
});
