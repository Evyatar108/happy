import { EventEmitter } from 'node:events';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Config } from './config';
import type { Credentials } from './credentials';
import type { DecryptedSession } from './api';
import {
    LOCKED_OUTPUT_HEURISTIC,
    classifySession,
    evaluateMonitorFixture,
    runMonitorOnce,
    runMonitorWatch,
    summarizeLastOutput,
    type MonitorDependencies,
} from './monitor';

class MockSessionClient extends EventEmitter {
    closed = false;
    close(): void {
        this.closed = true;
    }
}

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..');
const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'monitor', '10-session-10-minute');

const config: Config = {
    serverUrl: 'https://example.com',
    homeDir: '/tmp/happy-agent-monitor-test',
    credentialPath: '/tmp/happy-agent-monitor-test/agent.key',
};

const creds: Credentials = {
    token: 'token',
    secret: new Uint8Array(32),
    contentKeyPair: {
        publicKey: new Uint8Array(32),
        secretKey: new Uint8Array(32),
    },
};

function makeSession(overrides: Partial<DecryptedSession> = {}, projectPath?: string): DecryptedSession {
    return {
        id: overrides.id ?? 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: overrides.metadata ?? { runId: 'run-1', turnActive: false, projectPath: projectPath ?? '/tmp/happy-agent-monitor-test' },
        agentState: overrides.agentState ?? { controlledByUser: false, requests: {} },
        dataEncryptionKey: null,
        encryption: { key: new Uint8Array(32), variant: 'legacy' },
        ...overrides,
    };
}

function makeDeps(overrides: Partial<MonitorDependencies> = {}): MonitorDependencies {
    return {
        listActiveSessions: vi.fn(async () => [makeSession()]),
        getSessionMessages: vi.fn(async () => [{
            id: 'msg-1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            localId: null,
            content: { role: 'assistant', content: { type: 'text', text: 'ready for review' } },
        }]),
        appendLedgerRecord: vi.fn(async () => undefined),
        createSessionClient: vi.fn(() => new MockSessionClient()),
        now: () => '2026-05-10T20:00:00.000Z',
        setInterval: vi.fn(() => 123),
        clearInterval: vi.fn(),
        ...overrides,
    };
}

let tempRoots: string[] = [];

async function withTempCwd<T>(fn: () => Promise<T>): Promise<T> {
    const original = process.cwd();
    const root = await mkdtemp(join(tmpdir(), 'happy-agent-monitor-'));
    tempRoots.push(root);
    process.chdir(root);
    try {
        return await fn();
    } finally {
        process.chdir(original);
    }
}

describe('monitor', () => {
    afterEach(async () => {
        await Promise.all(tempRoots.map(root => rm(root, { recursive: true, force: true })));
        tempRoots = [];
        vi.restoreAllMocks();
    });

    it('classifies active, idle, pending-permission, and validation states from session state plus ledger records', () => {
        expect(classifySession({ turnActive: true }, { controlledByUser: false, requests: {} }, []))
            .toEqual({ active: true, pendingPermission: false, hasValidationEvidence: false });
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: {} }, []))
            .toEqual({ active: false, pendingPermission: false, hasValidationEvidence: false });
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: { req1: {} } }, []))
            .toEqual({ active: true, pendingPermission: true, hasValidationEvidence: false });
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: {} }, [{
            runId: 'run-1',
            sessionId: 'session-1',
            timestamp: '2026-05-10T20:00:00.000Z',
            eventType: 'done',
            scopeSummary: 'done',
            testReference: 'test',
            verificationUrl: 'https://example.com/verify',
            caveats: [],
        }])).toEqual({ active: false, pendingPermission: false, hasValidationEvidence: true });
        expect(classifySession({ turnActive: true }, { controlledByUser: false, requests: { req1: {} } }, [{
            runId: 'run-1',
            sessionId: 'session-1',
            timestamp: '2026-05-10T20:00:00.000Z',
            eventType: 'validation-attached',
            testReference: 'test',
            verificationUrl: 'https://example.com/verify',
        }])).toEqual({ active: true, pendingPermission: true, hasValidationEvidence: true });
    });

    it('locks the fixture-selected last-output heuristic to assistant text', async () => {
        const evaluation = await evaluateMonitorFixture(fixtureDir);

        expect(evaluation.samples).toBe(41);
        expect(evaluation.misclassificationRate).toBeLessThanOrEqual(0.05);
        expect(evaluation.selectedHeuristic).toBe('assistant-text');
        expect(LOCKED_OUTPUT_HEURISTIC).toBe(evaluation.selectedHeuristic);
        expect(evaluation.heuristicScores['assistant-text'].errorRate).toBe(0);
        expect(evaluation.heuristicScores['tool-result'].errorRate).toBeGreaterThan(0);
        expect(evaluation.heuristicScores['server-summary'].errorRate).toBeGreaterThan(0);
    });

    it('extracts assistant text while ignoring lifecycle and ready events', () => {
        const messages = [
            { content: { role: 'session', content: { ev: { t: 'turn-start' } } } },
            { content: { role: 'agent', content: { type: 'event', data: { type: 'ready' } } } },
            { content: { role: 'assistant', content: { type: 'text', text: 'meaningful output' } } },
        ];

        expect(summarizeLastOutput('assistant-text', messages, {})).toBe('meaningful output');
    });

    it('polls active sessions, writes monitor ledger records, and falls back to HTTP polling on socket disconnect', async () => {
        await withTempCwd(async () => {
            const session = makeSession({ agentState: { controlledByUser: false, requests: { req1: {} } } });
            const client = new MockSessionClient();
            const deps = makeDeps({
                listActiveSessions: vi.fn(async () => [session]),
                createSessionClient: vi.fn(() => client),
            });

            const stop = await runMonitorWatch(config, creds, 'run-1', deps);
            expect(deps.listActiveSessions).toHaveBeenCalledTimes(1);
            expect(deps.createSessionClient).toHaveBeenCalledTimes(1);
            expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), 2000);
            expect(deps.appendLedgerRecord).toHaveBeenCalledWith('run-1', 'session-1', expect.objectContaining({
                eventType: 'pending-permission',
                requestIds: ['req1'],
            }));

            client.emit('disconnected', 'transport close');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(deps.listActiveSessions).toHaveBeenCalledTimes(2);

            stop();
            expect(client.closed).toBe(true);
        });
    });

    it('uses validation ledger records only for has-validation-evidence', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happy-agent-monitor-'));
        tempRoots.push(root);
        const session = makeSession({}, root);
        await mkdir(join(root, '.ralph', 'state', 'run-1'), { recursive: true });
        await writeFile(join(root, '.ralph', 'state', 'run-1', 'session-1.jsonl'), `${JSON.stringify({
            runId: 'run-1',
            sessionId: 'session-1',
            timestamp: '2026-05-10T20:00:00.000Z',
            eventType: 'validation-attached',
            testReference: 'pnpm test',
            verificationUrl: 'https://example.com/verify',
        })}\n`, 'utf8');
        const deps = makeDeps({ listActiveSessions: vi.fn(async () => [session]) });
        const snapshots = await runMonitorOnce(config, creds, 'run-1', deps);
        expect(snapshots[0].state.hasValidationEvidence).toBe(true);
    });

    it('throws when neither session metadata.projectPath nor HAPPY_PROJECT_PATH env var is set', async () => {
        const originalEnv = process.env.HAPPY_PROJECT_PATH;
        delete process.env.HAPPY_PROJECT_PATH;
        try {
            const session = makeSession({ metadata: { runId: 'run-1', turnActive: false } });
            const deps = makeDeps({ listActiveSessions: vi.fn(async () => [session]) });
            await expect(runMonitorOnce(config, creds, 'run-1', deps)).rejects.toThrow(
                'Cannot resolve project path',
            );
        } finally {
            if (originalEnv !== undefined) process.env.HAPPY_PROJECT_PATH = originalEnv;
        }
    });

    it('scopes runMonitorOnce to sessions whose metadata.runId matches the requested runId', async () => {
        await withTempCwd(async () => {
            const sessionA1 = makeSession({ id: 'session-a1', metadata: { runId: 'run-A', turnActive: false, projectPath: '/tmp/happy-agent-monitor-test' } });
            const sessionA2 = makeSession({ id: 'session-a2', metadata: { runId: 'run-A', turnActive: true, projectPath: '/tmp/happy-agent-monitor-test' } });
            const sessionB1 = makeSession({ id: 'session-b1', metadata: { runId: 'run-B', turnActive: false, projectPath: '/tmp/happy-agent-monitor-test' } });
            const deps = makeDeps({
                listActiveSessions: vi.fn(async () => [sessionA1, sessionA2, sessionB1]),
            });

            const snapshots = await runMonitorOnce(config, creds, 'run-A', deps);

            const snapshotIds = snapshots.map(s => s.sessionId);
            expect(snapshotIds).toContain('session-a1');
            expect(snapshotIds).toContain('session-a2');
            expect(snapshotIds).not.toContain('session-b1');
            expect(deps.appendLedgerRecord).not.toHaveBeenCalledWith('run-A', 'session-b1', expect.anything());
        });
    });
});
