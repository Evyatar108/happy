import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LedgerRecord } from '@slopus/happy-wire';

import type { Config } from './config';
import type { Credentials } from './credentials';
import { getSessionMessages, listActiveSessions, type DecryptedMessage, type DecryptedSession } from './api';
import { SessionClient } from './session';
import { appendLedgerRecord } from './ledger/writer';

export type MonitorClass = 'active' | 'idle' | 'pending-permission' | 'has-validation-evidence';
export type OutputHeuristic = 'assistant-text' | 'tool-result' | 'server-summary';

type AgentState = {
    controlledByUser?: unknown;
    requests?: unknown;
    [key: string]: unknown;
};

type SessionMetadata = {
    turnActive?: unknown;
    summary?: unknown;
    [key: string]: unknown;
};

export type MonitorSnapshot = {
    sessionId: string;
    state: MonitorClass;
    lastOutputSummary: string | null;
    lastOutputHeuristic: OutputHeuristic | null;
    requestIds: string[];
};

type SessionClientLike = {
    on(event: 'state-change', listener: (data: { metadata: unknown; agentState: unknown }) => void): unknown;
    on(event: 'disconnected', listener: (reason: string) => void): unknown;
    close(): void;
};

export type MonitorDependencies = {
    listActiveSessions: typeof listActiveSessions;
    getSessionMessages: typeof getSessionMessages;
    appendLedgerRecord: typeof appendLedgerRecord;
    createSessionClient: (session: DecryptedSession, creds: Credentials, config: Config) => SessionClientLike;
    now: () => string;
    setInterval: (callback: () => void, delayMs: number) => NodeJS.Timeout | number;
    clearInterval: (timer: NodeJS.Timeout | number) => void;
};

const defaultDependencies: MonitorDependencies = {
    listActiveSessions,
    getSessionMessages,
    appendLedgerRecord,
    createSessionClient: (session, creds, config) => new SessionClient({
        sessionId: session.id,
        encryptionKey: session.encryption.key,
        encryptionVariant: session.encryption.variant,
        token: creds.token,
        serverUrl: config.serverUrl,
        initialAgentState: session.agentState ?? null,
    }),
    now: () => new Date().toISOString(),
    setInterval,
    clearInterval,
};

export const LOCKED_OUTPUT_HEURISTIC: OutputHeuristic = 'assistant-text';
const POLL_INTERVAL_MS = 2_000;

function getRequestIds(agentState: unknown): string[] {
    const state = agentState as AgentState | null;
    const requests = state?.requests;
    if (Array.isArray(requests)) {
        return requests
            .map((request, index) => {
                if (request != null && typeof request === 'object' && typeof (request as { id?: unknown }).id === 'string') {
                    return (request as { id: string }).id;
                }
                return String(index);
            });
    }
    if (requests != null && typeof requests === 'object') {
        return Object.keys(requests as Record<string, unknown>);
    }
    return [];
}

export function hasValidationEvidence(records: readonly LedgerRecord[]): boolean {
    return records.some(record => record.eventType === 'validation-attached' || record.eventType === 'done');
}

export function classifySession(metadata: unknown, agentState: unknown, ledgerRecords: readonly LedgerRecord[]): MonitorClass {
    if (hasValidationEvidence(ledgerRecords)) {
        return 'has-validation-evidence';
    }

    const requestIds = getRequestIds(agentState);
    if (requestIds.length > 0) {
        return 'pending-permission';
    }

    const meta = metadata as SessionMetadata | null;
    const state = agentState as AgentState | null;
    if (meta?.turnActive === true || state?.controlledByUser === true) {
        return 'active';
    }

    return 'idle';
}

function asText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractTextPart(content: unknown): string | null {
    if (typeof content === 'string') return asText(content);
    if (content == null || typeof content !== 'object') return null;
    if (Array.isArray(content)) {
        const parts = content.map(extractTextPart).filter((part): part is string => part != null);
        return parts.length > 0 ? parts.join('\n') : null;
    }
    const record = content as Record<string, unknown>;
    return asText(record.text) ?? asText(record.result) ?? asText(record.output) ?? extractTextPart(record.content);
}

function isLifecycleMessage(content: unknown): boolean {
    if (content == null || typeof content !== 'object' || Array.isArray(content)) return false;
    const record = content as Record<string, unknown>;
    if (record.role === 'session') return true;
    const body = record.content as Record<string, unknown> | null;
    if (body == null || typeof body !== 'object' || Array.isArray(body)) return false;
    if (body.type === 'config' || body.type === 'ready') return true;
    const data = body.data as Record<string, unknown> | null;
    return body.type === 'event' && (data?.type === 'ready' || data?.type === 'config');
}

export function summarizeLastOutput(
    heuristic: OutputHeuristic,
    messages: readonly Pick<DecryptedMessage, 'content'>[],
    metadata: unknown,
): string | null {
    if (heuristic === 'server-summary') {
        const meta = metadata as SessionMetadata | null;
        if (typeof meta?.summary === 'string') return asText(meta.summary);
        if (meta?.summary != null && typeof meta.summary === 'object') {
            return asText((meta.summary as { text?: unknown }).text);
        }
        return null;
    }

    for (const message of [...messages].reverse()) {
        const content = message.content;
        if (content == null || typeof content !== 'object' || Array.isArray(content)) continue;
        if (isLifecycleMessage(content)) continue;
        const record = content as Record<string, unknown>;
        const body = record.content as Record<string, unknown> | string | unknown[] | null;

        if (heuristic === 'assistant-text' && record.role === 'assistant') {
            const text = extractTextPart(body);
            if (text) return text;
        }

        if (heuristic === 'tool-result') {
            const bodyRecord = body != null && typeof body === 'object' && !Array.isArray(body)
                ? body as Record<string, unknown>
                : null;
            const isToolResult = record.role === 'tool' || bodyRecord?.type === 'tool-result' || bodyRecord?.type === 'tool_use';
            if (isToolResult) {
                const text = extractTextPart(body);
                if (text) return text;
            }
        }
    }

    return null;
}

async function readSessionLedger(runId: string, sessionId: string): Promise<LedgerRecord[]> {
    try {
        const text = await readFile(join(process.env.HAPPY_PROJECT_PATH ?? process.cwd(), '.ralph', 'state', runId, `${sessionId}.jsonl`), 'utf8');
        return text
            .split(/\r?\n/)
            .filter(line => line.trim().length > 0)
            .map(line => JSON.parse(line) as LedgerRecord);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
}

async function appendMonitorRecords(
    deps: MonitorDependencies,
    runId: string,
    snapshot: MonitorSnapshot,
    timestamp: string,
): Promise<void> {
    const base = { runId, sessionId: snapshot.sessionId, timestamp };
    if (snapshot.state === 'idle') {
        await deps.appendLedgerRecord(runId, snapshot.sessionId, { ...base, eventType: 'idle-reached', queueDepth: 0 });
    }
    if (snapshot.state === 'pending-permission') {
        await deps.appendLedgerRecord(runId, snapshot.sessionId, {
            ...base,
            eventType: 'pending-permission',
            requestIds: snapshot.requestIds,
        });
    }
    if (snapshot.lastOutputSummary && snapshot.lastOutputHeuristic) {
        await deps.appendLedgerRecord(runId, snapshot.sessionId, {
            ...base,
            eventType: 'last-output-summary',
            summary: snapshot.lastOutputSummary,
            heuristic: snapshot.lastOutputHeuristic,
        });
    }
}

export async function snapshotSession(
    config: Config,
    creds: Credentials,
    runId: string,
    session: DecryptedSession,
    deps: MonitorDependencies = defaultDependencies,
): Promise<MonitorSnapshot> {
    const ledgerRecords = await readSessionLedger(runId, session.id);
    const messages = await deps.getSessionMessages(config, creds, session.id, session.encryption);
    const requestIds = getRequestIds(session.agentState);
    const snapshot = {
        sessionId: session.id,
        state: classifySession(session.metadata, session.agentState, ledgerRecords),
        lastOutputSummary: summarizeLastOutput(LOCKED_OUTPUT_HEURISTIC, messages, session.metadata),
        lastOutputHeuristic: LOCKED_OUTPUT_HEURISTIC,
        requestIds,
    } satisfies MonitorSnapshot;
    await appendMonitorRecords(deps, runId, snapshot, deps.now());
    return snapshot;
}

function sessionBelongsToRun(session: DecryptedSession, runId: string): boolean {
    const meta = session.metadata as { runId?: unknown } | null;
    return meta?.runId === runId;
}

export async function runMonitorOnce(
    config: Config,
    creds: Credentials,
    runId: string,
    deps: MonitorDependencies = defaultDependencies,
): Promise<MonitorSnapshot[]> {
    const sessions = await deps.listActiveSessions(config, creds);
    const inBatch = sessions.filter(s => sessionBelongsToRun(s, runId));
    return Promise.all(inBatch.map(session => snapshotSession(config, creds, runId, session, deps)));
}

export async function runMonitorWatch(
    config: Config,
    creds: Credentials,
    runId: string,
    deps: MonitorDependencies = defaultDependencies,
): Promise<() => void> {
    const clients = new Map<string, SessionClientLike>();

    const poll = async () => {
        const sessions = await deps.listActiveSessions(config, creds);
        const inBatch = sessions.filter(s => sessionBelongsToRun(s, runId));
        const activeIds = new Set(inBatch.map(session => session.id));
        for (const [sessionId, client] of clients) {
            if (!activeIds.has(sessionId)) {
                client.close();
                clients.delete(sessionId);
            }
        }
        for (const session of inBatch) {
            await snapshotSession(config, creds, runId, session, deps);
            if (clients.has(session.id)) continue;
            const client = deps.createSessionClient(session, creds, config);
            clients.set(session.id, client);
            client.on('state-change', async (data) => {
                const liveSession = { ...session, metadata: data.metadata, agentState: data.agentState };
                await snapshotSession(config, creds, runId, liveSession, deps);
            });
            client.on('disconnected', () => {
                void poll();
            });
        }
    };

    await poll();
    const timer = deps.setInterval(() => {
        void poll();
    }, POLL_INTERVAL_MS);

    return () => {
        deps.clearInterval(timer);
        for (const client of clients.values()) client.close();
        clients.clear();
    };
}

export type FixtureSample = {
    timestamp: string;
    label: MonitorClass;
    metadata: unknown;
    agentState: unknown;
    ledgerRecords?: LedgerRecord[];
    messages?: Array<Pick<DecryptedMessage, 'content'>>;
    expectedLastOutput?: string;
};

type FixtureRecording = {
    sessionId: string;
    samples: FixtureSample[];
};

export type MonitorFixtureEvaluation = {
    samples: number;
    stateErrors: number;
    misclassificationRate: number;
    heuristicScores: Record<OutputHeuristic, { samples: number; errors: number; errorRate: number }>;
    selectedHeuristic: OutputHeuristic;
};

export async function loadMonitorFixture(fixtureDir: string): Promise<FixtureRecording[]> {
    const entries = (await readdir(fixtureDir)).filter(entry => entry.endsWith('.json')).sort();
    return Promise.all(entries.map(async (entry) => JSON.parse(await readFile(join(fixtureDir, entry), 'utf8')) as FixtureRecording));
}

export async function evaluateMonitorFixture(fixtureDir: string): Promise<MonitorFixtureEvaluation> {
    const recordings = await loadMonitorFixture(fixtureDir);
    const heuristicScores: MonitorFixtureEvaluation['heuristicScores'] = {
        'assistant-text': { samples: 0, errors: 0, errorRate: 0 },
        'tool-result': { samples: 0, errors: 0, errorRate: 0 },
        'server-summary': { samples: 0, errors: 0, errorRate: 0 },
    };
    let samples = 0;
    let stateErrors = 0;

    for (const recording of recordings) {
        for (const sample of recording.samples) {
            samples += 1;
            const actual = classifySession(sample.metadata, sample.agentState, sample.ledgerRecords ?? []);
            if (actual !== sample.label) stateErrors += 1;

            if (sample.expectedLastOutput) {
                for (const heuristic of Object.keys(heuristicScores) as OutputHeuristic[]) {
                    const score = heuristicScores[heuristic];
                    score.samples += 1;
                    if (summarizeLastOutput(heuristic, sample.messages ?? [], sample.metadata) !== sample.expectedLastOutput) {
                        score.errors += 1;
                    }
                }
            }
        }
    }

    for (const score of Object.values(heuristicScores)) {
        score.errorRate = score.samples === 0 ? 0 : score.errors / score.samples;
    }

    const selectedHeuristic = (Object.keys(heuristicScores) as OutputHeuristic[])
        .sort((a, b) => heuristicScores[a].errorRate - heuristicScores[b].errorRate || a.localeCompare(b))[0];

    return {
        samples,
        stateErrors,
        misclassificationRate: samples === 0 ? 0 : stateErrors / samples,
        heuristicScores,
        selectedHeuristic,
    };
}
