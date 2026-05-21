import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from '../context.js';
import type { ManagedProcessSnapshot } from '../process-manager.js';
import { asSdkInputSchema, devServerStatusInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

const DEV_SERVER_NAME = 'dev-server';

export interface DevServerStatusResult {
  running: boolean;
  status?: ManagedProcessSnapshot['status'];
  url?: string;
  pid?: number;
  startedAt?: Date;
  lastReadyAt?: Date;
  lastLogTail: {
    stdout: string[];
    stderr: string[];
  };
}

export function registerDevServerStatusTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.dev_server.status',
    {
      description: 'Report the current overview dev server process state and recent logs.',
      inputSchema: asSdkInputSchema(devServerStatusInputSchema),
    },
    async () => toToolResult(devServerStatus(context)),
  );
}

export function devServerStatus(context: ServerContext): DevServerStatusResult {
  const snapshot = context.processManager.status(DEV_SERVER_NAME) as ManagedProcessSnapshot | null;
  const logs = context.processManager.logs(DEV_SERVER_NAME) ?? { stdout: [], stderr: [] };
  if (!snapshot || snapshot.status === 'exited') {
    return { running: false, status: snapshot?.status, lastLogTail: tailLogs(logs) };
  }
  return {
    running: true,
    status: snapshot.status,
    url: snapshot.url,
    pid: snapshot.pid,
    startedAt: snapshot.startedAt,
    lastReadyAt: snapshot.lastReadyAt,
    lastLogTail: tailLogs(logs),
  };
}

function tailLogs(logs: { stdout: string[]; stderr: string[] }): { stdout: string[]; stderr: string[] } {
  return { stdout: logs.stdout.slice(-10), stderr: logs.stderr.slice(-10) };
}
