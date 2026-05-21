import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { discoverCrewSessions } from '../../../../scripts/lib/crews-cross-walk.mjs';

import type { ServerContext } from '../context.js';
import type { ListCrewSessionsInput } from '../schemas.js';
import type { CrewSessionRef, OverviewData, OverviewRalphState, RalphStage } from '../types.js';
import type { ToolEnvelope } from './read-only.js';

const CACHE_MS = 500;
const CREW_ROLES = ['members', 'leads'] as const;

type CrewRoleDir = (typeof CREW_ROLES)[number];

export interface LiveCrewSession extends CrewSessionRef {
  lastHeartbeatAt?: string;
  lastSummary?: string;
  lastTurnAt?: string;
  listenerState?: unknown;
  actorState?: unknown;
}

export type LiveCrewSessionResult = LiveCrewSession & {
  taskId: string;
  stage: RalphStage;
  role: 'member' | 'lead';
};

type CacheEntry = {
  expiresAt: number;
  data: LiveCrewSessionResult[];
};

const discoveryCache = new WeakMap<ServerContext, CacheEntry>();

export async function listCrewSessions(
  context: ServerContext,
  input: ListCrewSessionsInput,
): Promise<ToolEnvelope<LiveCrewSessionResult[]>> {
  const data = await getCachedLiveSessions(context);
  if (!data.ok) {
    return data;
  }

  const filtered = input.taskId ? data.data.filter((session) => session.taskId === input.taskId) : data.data;
  return { ok: true, data: filtered };
}

async function getCachedLiveSessions(context: ServerContext): Promise<ToolEnvelope<LiveCrewSessionResult[]>> {
  const now = Date.now();
  const cached = discoveryCache.get(context);
  if (cached && cached.expiresAt > now) {
    return { ok: true, data: cached.data };
  }

  const overviewData = await context.snapshotReader.getOverviewData();
  if (!overviewData) {
    return { ok: false, error: 'missing overview data' };
  }

  const ralphState = await readRalphState(context.config.outputs.sidecarJson);
  if (!ralphState) {
    return { ok: false, error: 'missing Ralph state' };
  }

  const discovered = discoverCrewSessions({
    repoRoot: context.repoRoot,
    ralphState,
    overviewData: overviewData as OverviewData,
    crewsRoot: context.config.crewsRoot,
    logger: { warn: (message) => process.stderr.write(`${message}\n`) },
  });
  const data = await flattenDiscoveredSessions(context.config.crewsRoot, discovered);
  discoveryCache.set(context, { expiresAt: now + CACHE_MS, data });
  return { ok: true, data };
}

async function readRalphState(filePath: string): Promise<OverviewRalphState | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as OverviewRalphState;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

async function flattenDiscoveredSessions(
  crewsRoot: string,
  discovered: Map<string, Partial<Record<RalphStage, CrewSessionRef[]>>>,
): Promise<LiveCrewSessionResult[]> {
  const result: LiveCrewSessionResult[] = [];
  for (const [taskId, byStage] of discovered.entries()) {
    for (const [stage, entries] of Object.entries(byStage) as Array<[RalphStage, CrewSessionRef[] | undefined]>) {
      for (const entry of entries ?? []) {
        const liveManifest = await readLiveManifest(crewsRoot, entry);
        result.push({
          ...entry,
          ...liveManifest.fields,
          taskId,
          stage,
          role: liveManifest.role,
        });
      }
    }
  }
  return result;
}

async function readLiveManifest(
  crewsRoot: string,
  session: CrewSessionRef,
): Promise<{ role: 'member' | 'lead'; fields: Partial<LiveCrewSession> }> {
  const candidates = await Promise.all(
    CREW_ROLES.map(async (role) => ({ role, manifest: await readManifest(manifestPath(crewsRoot, session, role)) })),
  );
  const match =
    candidates.find((candidate) => candidate.manifest?.sessionId && candidate.manifest.sessionId === session.sessionId) ??
    candidates.find((candidate) => candidate.manifest) ??
    candidates[0];

  return {
    role: match.role === 'leads' ? 'lead' : 'member',
    fields: liveFields(match.manifest),
  };
}

async function readManifest(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    process.stderr.write(`overview-mcp: failed to read crew manifest at ${filePath}: ${formatError(error)}\n`);
    return null;
  }
}

function manifestPath(crewsRoot: string, session: CrewSessionRef, role: CrewRoleDir): string {
  return path.join(crewsRoot, 'crews', session.crewName, role, session.memberName, 'manifest.json');
}

function liveFields(manifest: Record<string, unknown> | null): Partial<LiveCrewSession> {
  if (!manifest) {
    return {};
  }
  return pruneUndefined({
    transcriptPath: stringValue(manifest.transcriptPath),
    lastHeartbeatAt: stringValue(manifest.lastHeartbeatAt),
    lastSummary: stringValue(manifest.lastSummary),
    lastTurnAt: stringValue(manifest.lastTurnAt),
    listenerState: manifest.listenerState,
    actorState: manifest.actorState,
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as Partial<T>;
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
