import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from '../context.js';
import { asSdkInputSchema, devServerStopInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

const DEV_SERVER_NAME = 'dev-server';

export type DevServerStopResult = { ok: true; stoppedAt: Date; pid?: number } | { ok: false; error: string };

export function registerDevServerStopTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.dev_server.stop',
    {
      description: 'Stop the Ralph overview Vite dev server if this MCP process started it.',
      inputSchema: asSdkInputSchema(devServerStopInputSchema),
    },
    async () => toToolResult(await devServerStop(context)),
  );
}

export async function devServerStop(context: ServerContext): Promise<DevServerStopResult> {
  const stopped = await context.processManager.stop(DEV_SERVER_NAME);
  if (!stopped) {
    return { ok: true, stoppedAt: new Date() };
  }
  return { ok: true, stoppedAt: new Date(), pid: stopped.pid };
}
