import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from '../context.js';
import { AlreadyRunningError, type ManagedProcessLogs } from '../process-manager.js';
import { asSdkInputSchema, devServerStartInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

const DEV_SERVER_NAME = 'dev-server';
const READY_TIMEOUT_MS = 60_000;
const ANSI_CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export type DevServerStartResult =
  | {
      ok: true;
      url: string;
      pid: number;
      startedAt: Date;
      alreadyRunning?: boolean;
    }
  | {
      ok: false;
      error: string;
      lastLogLines?: ManagedProcessLogs;
    };

interface DevServerStartData {
  url: string;
  pid: number;
  startedAt: Date;
  alreadyRunning?: boolean;
}

export function registerDevServerStartTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.dev_server.start',
    {
      description: 'Start the Ralph overview Vite dev server and return its local URL.',
      inputSchema: asSdkInputSchema(devServerStartInputSchema),
    },
    async () => toToolResult(await devServerStart(context)),
  );
}

export async function devServerStart(
  context: ServerContext,
  options: { readyTimeoutMs?: number } = {},
): Promise<DevServerStartResult> {
  try {
    const managed = context.processManager.spawn({
      name: DEV_SERVER_NAME,
      cmd: 'pnpm',
      args: ['overview'],
      cwd: context.repoRoot,
    });
    const ready = await managed.onReady(parseViteReadyUrl, { timeoutMs: options.readyTimeoutMs ?? READY_TIMEOUT_MS });
    return successResult(ready);
  } catch (error) {
    if (error instanceof AlreadyRunningError) {
      try {
        const ready = await error.process.readyPromise;
        return successResult({ ...ready, alreadyRunning: true });
      } catch (readyError) {
        return failureResult(readyError, error.process.logs());
      }
    }

    const lastLogLines = context.processManager.logs(DEV_SERVER_NAME) ?? undefined;
    await context.processManager.stop(DEV_SERVER_NAME).catch(() => undefined);
    return failureResult(error, lastLogLines);
  }
}

export function parseViteReadyUrl(line: string): string | false {
  const normalized = line.replace(ANSI_CSI_RE, '');
  return normalized.match(/Local:\s+(https?:\S+)/)?.[1] ?? false;
}

function successResult(ready: DevServerStartData): DevServerStartResult {
  return { ok: true, ...ready };
}

function failureResult(error: unknown, lastLogLines?: ManagedProcessLogs): DevServerStartResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    lastLogLines: trimLogs(lastLogLines),
  };
}

function trimLogs(logs: ManagedProcessLogs | undefined): ManagedProcessLogs | undefined {
  if (!logs) {
    return undefined;
  }
  return { stdout: logs.stdout.slice(-30), stderr: logs.stderr.slice(-30) };
}
