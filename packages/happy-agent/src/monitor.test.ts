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
    userId: 'user-1',
    secret: new Uint8Array(32),
    contentKeyPair: {
        publicKey: new Uint8Array(32),
        secretKey: new Uint8Array(32),
    },
};

function makeSession(overrides: Partial<DecryptedSession> = {}): DecryptedSession {
    return {
        id: overrides.id ?? 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: overrides.metadata ?? { runId: 'run-1', turnActive: false },
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
        expect(classifySession({ turnActive: true }, { controlledByUser: false, requests: {} }, [])).toBe('active');
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: {} }, [])).toBe('idle');
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: { req1: {} } }, [])).toBe('pending-permission');
        expect(classifySession({ turnActive: false }, { controlledByUser: false, requests: {} }, [{
            runId: 'run-1',
            sessionId: 'session-1',
            timestamp: '2026-05-10T20:00:00.000Z',
            eventType: 'done',
            scopeSummary: 'done',
            testReference: 'test',
            verificationUrl: 'https://example.com/verify',
            caveats: [],
        }])).toBe('has-validation-evidence');
    });

    it('locks the fixture-selected last-output heuristic to assistant text', async () => {
        const evaluation = await evaluateMonitorFixture(fixtureDir);

        expect(evaluation.samples).toBe(40);
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
        await withTempCwd(async () => {
            await mkdir(join(process.cwd(), '.ralph', 'state', 'run-1'), { recursive: true });
            await writeFile(join(process.cwd(), '.ralph', 'state', 'run-1', 'session-1.jsonl'), `${JSON.stringify({
                runId: 'run-1',
                sessionId: 'session-1',
                timestamp: '2026-05-10T20:00:00.000Z',
                eventType: 'validation-attached',
                testReference: 'pnpm test',
                verificationUrl: 'https://example.com/verify',
            })}\n`, 'utf8');
            const snapshots = await runMonitorOnce(config, creds, 'run-1', makeDeps());
            expect(snapshots[0].state).toBe('has-validation-evidence');
        });
    });
});
