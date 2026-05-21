import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from '../context.js';
import { asSdkInputSchema, devServerLogsInputSchema, type DevServerLogsInput } from '../schemas.js';
import { toToolResult } from './read-only.js';

const DEV_SERVER_NAME = 'dev-server';

export type DevServerLogsResult = { stdout?: string[]; stderr?: string[] };

export function registerDevServerLogsTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.dev_server.logs',
    {
      description: 'Return the last lines captured from the overview dev server stdout and stderr buffers.',
      inputSchema: asSdkInputSchema(devServerLogsInputSchema),
    },
    async (input) => toToolResult(devServerLogs(context, input as DevServerLogsInput)),
  );
}

export function devServerLogs(context: ServerContext, input: DevServerLogsInput): DevServerLogsResult {
  const logs = context.processManager.logs(DEV_SERVER_NAME) ?? { stdout: [], stderr: [] };
  const tail = clampTail(input.tail ?? 100);
  const stream = input.stream ?? 'both';

  if (stream === 'stdout') {
    return { stdout: logs.stdout.slice(-tail) };
  }
  if (stream === 'stderr') {
    return { stderr: logs.stderr.slice(-tail) };
  }
  return { stdout: logs.stdout.slice(-tail), stderr: logs.stderr.slice(-tail) };
}

export function clampTail(tail: number): number {
  if (!Number.isFinite(tail)) {
    return 100;
  }
  return Math.min(1000, Math.max(1, Math.trunc(tail)));
}
