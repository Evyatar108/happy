import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { resolveSessionRecordByPrefix, resolveHappySession } from './resolveHappySession';
import * as daemonClient from '@/daemon/daemonClient';
import * as localHappyAgentAuth from './localHappyAgentAuth';

describe('resolveSessionRecordByPrefix', () => {
    const sessions = [
        { id: 'cmmij8olq00dp5jcxr3wtbpau' },
        { id: 'cmmhiilo00dv7y7e8wjdr5s9x' },
    ];

    it('resolves an exact match', () => {
        expect(resolveSessionRecordByPrefix(sessions, 'cmmhiilo00dv7y7e8wjdr5s9x')).toEqual({
            id: 'cmmhiilo00dv7y7e8wjdr5s9x',
        });
    });

    it('resolves by unique prefix', () => {
        expect(resolveSessionRecordByPrefix(sessions, 'cmmij8')).toEqual({
            id: 'cmmij8olq00dp5jcxr3wtbpau',
        });
    });

    it('rejects unknown prefixes', () => {
        expect(() => resolveSessionRecordByPrefix(sessions, 'missing')).toThrow(
            'No Happy session found matching "missing"',
        );
    });

    it('rejects ambiguous prefixes', () => {
        expect(() => resolveSessionRecordByPrefix(sessions, 'cmm')).toThrow(
            'Ambiguous Happy session "cmm" matches 2 sessions. Be more specific.',
        );
    });
});

describe('resolveHappySession — daemon-down regression (F-003 / F-018)', () => {
    beforeEach(() => {
        vi.spyOn(localHappyAgentAuth, 'readLocalHappyAgentCredentials').mockReturnValue({
            token: 'test-token',
            secret: new Uint8Array(32),
            contentKeyPair: {
                publicKey: new Uint8Array(32),
                secretKey: new Uint8Array(32),
            },
        });
        vi.spyOn(daemonClient, 'tunnelFetch').mockRejectedValue(
            new Error('Happy daemon is not ready; run happy daemon start'),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits a clear error mentioning daemon requirement when daemon is down but agent.key is present', async () => {
        await expect(resolveHappySession('cmmij8olq00dp5jcxr3wtbpau')).rejects.toThrow(
            'Cannot resume Happy session: the Happy daemon is not running on this machine.',
        );
    });

    it('error message includes instruction to run happy daemon start', async () => {
        await expect(resolveHappySession('cmmij8olq00dp5jcxr3wtbpau')).rejects.toThrow(
            'Run `happy daemon start` first.',
        );
    });

    it('error message notes that cross-machine resume is no longer supported', async () => {
        await expect(resolveHappySession('cmmij8olq00dp5jcxr3wtbpau')).rejects.toThrow(
            'cross-machine resume is no longer supported',
        );
    });
});
