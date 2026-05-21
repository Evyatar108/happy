import { once } from 'node:events';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readLockStatus } from '../../../../scripts/lib/sync-lock.mjs';

import type { ServerContext } from '../context.js';
import { AlreadyRunningError, type ManagedProcessLogs } from '../process-manager.js';
import { asSdkInputSchema, syncNowInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

const SYNC_NOW_NAME = 'sync-now';
const SUMMARY_RE = /^sync: matched=(\d+), unmatched=(\d+), duration=(\d+)ms$/;

export type SyncNowResult =
  | {
      ok: true;
      summary: {
        tasksMatched: number;
        unmatchedCount: number;
        durationMs: number;
      };
    }
  | {
      ok: false;
      error: string;
      lockHolderProcess?: string;
      lockHolderPid?: number;
      lastLogLines?: string[];
    };

export interface SyncSummary {
  tasksMatched: number;
  unmatchedCount: number;
  durationMs: number;
}

export function registerSyncNowTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.sync.now',
    {
      description: 'Run one Ralph overview state sync and return the parsed summary.',
      inputSchema: asSdkInputSchema(syncNowInputSchema),
    },
    async () => toToolResult(await syncNow(context)),
  );
}

export async function syncNow(context: ServerContext): Promise<SyncNowResult> {
  let managed;

  try {
    managed = context.processManager.spawn({
      name: SYNC_NOW_NAME,
      cmd: 'node',
      args: [path.join(context.repoRoot, 'scripts', 'sync-ralph-state.mjs'), '--repo', context.repoRoot],
      cwd: context.repoRoot,
      oneShot: true,
    });
  } catch (error) {
    if (error instanceof AlreadyRunningError) {
      return { ok: false, error: 'another sync in progress' };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const [code] = (await once(managed.child!, 'exit')) as [number | null, NodeJS.Signals | null];
  const logs = managed.logs();

  if (code === 0) {
    const summary = parseSyncSummary(logs.stdout);
    if (!summary) {
      return { ok: false, error: 'sync summary line missing', lastLogLines: stderrTail(logs) };
    }
    return { ok: true, summary };
  }

  const lockHeld = logs.stderr.some((line) => line.includes('another sync in progress'));
  if (lockHeld) {
    const lockStatus = await readLockStatus(context.config.lockFile);
    if (lockStatus.state === 'active') {
      return {
        ok: false,
        error: `sync lock held by ${lockStatus.process}`,
        lockHolderProcess: lockStatus.process,
        lockHolderPid: lockStatus.pid,
      };
    }
  }

  return {
    ok: false,
    error: `sync failed with exit code ${code ?? 'null'}`,
    lastLogLines: stderrTail(logs),
  };
}

export function parseSyncSummary(lines: string[]): SyncSummary | null {
  for (const line of lines) {
    const match = SUMMARY_RE.exec(line.trim());
    if (match) {
      return {
        tasksMatched: Number(match[1]),
        unmatchedCount: Number(match[2]),
        durationMs: Number(match[3]),
      };
    }
  }
  return null;
}

function stderrTail(logs: ManagedProcessLogs): string[] {
  return logs.stderr.slice(-30);
}
