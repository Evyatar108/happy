import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from '../context.js';
import { AlreadyRunningError, type ManagedProcessLogs } from '../process-manager.js';
import { asSdkInputSchema, buildInputSchema } from '../schemas.js';
import { toToolResult } from './read-only.js';

const BUILD_NAME = 'build';

export type BuildResult =
  | {
      ok: true;
      outputPath: string;
      sizeBytes: number;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      lastLogLines?: string[];
    };

export function registerBuildTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'overview.build',
    {
      description: 'Run pnpm overview:build and report the generated overview.html artifact.',
      inputSchema: asSdkInputSchema(buildInputSchema),
    },
    async () => toToolResult(await overviewBuild(context)),
  );
}

export async function overviewBuild(context: ServerContext): Promise<BuildResult> {
  const startedAt = Date.now();
  let managed;

  try {
    managed = context.processManager.spawn({
      name: BUILD_NAME,
      cmd: 'pnpm',
      args: ['overview:build'],
      cwd: context.repoRoot,
      oneShot: true,
    });
  } catch (error) {
    if (error instanceof AlreadyRunningError) {
      return { ok: false, error: 'another build in progress' };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const { exitCode: code } = await managed.exitPromise;
  const durationMs = Date.now() - startedAt;

  if (code === 0) {
    const outputPath = path.resolve(context.repoRoot, 'plans', 'overview.html');
    const stat = await fs.stat(outputPath);
    return { ok: true, outputPath, sizeBytes: stat.size, durationMs };
  }

  return {
    ok: false,
    error: `build failed with exit code ${code ?? 'null'}`,
    lastLogLines: stderrTail(managed.logs()),
  };
}

function stderrTail(logs: ManagedProcessLogs): string[] {
  return logs.stderr.slice(-30);
}
