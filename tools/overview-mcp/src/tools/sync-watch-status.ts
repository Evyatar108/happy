import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readLockStatus } from '../../../../scripts/lib/sync-lock.mjs';

import type { ServerContext } from '../context.js';
import { asSdkInputSchema, syncWatchStatusInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

export type SyncWatchStatusResult = {
  running: boolean;
  lockHolderPid?: number;
  lockHolderProcess?: string;
  startedAt?: string;
  lastHeartbeatAt?: Date;
  staleLock?: boolean;
};

export function registerSyncWatchStatusTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.sync.watch_status',
    {
      description: 'Inspect the Ralph overview sync lock holder and stale-lock state.',
      inputSchema: asSdkInputSchema(syncWatchStatusInputSchema),
    },
    async () => toToolResult(await syncWatchStatus(context)),
  );
}

export async function syncWatchStatus(context: ServerContext): Promise<SyncWatchStatusResult> {
  const status = await readLockStatus(context.config.lockFile);
  if (status.state === 'missing') {
    return { running: false };
  }

  if (status.state === 'stale') {
    return {
      running: false,
      lockHolderPid: status.pid,
      lockHolderProcess: status.process,
      startedAt: status.startedAt,
      lastHeartbeatAt: status.mtime,
      staleLock: true,
    };
  }

  return {
    running: true,
    lockHolderPid: status.pid,
    lockHolderProcess: status.process,
    startedAt: status.startedAt,
    lastHeartbeatAt: status.mtime,
  };
}
