import { isAbsolute, relative, sep } from 'path';

import type { ForkSessionOptions } from '@/api/apiMachine';
import type { Metadata } from '@/api/types';
import type { SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { buildResumeLaunch } from '@/resume/handleResumeCommand';
import { logger } from '@/ui/logger';
import { HAPPY_FORKED_FROM_SESSION_ID } from '@/utils/envNames';
import type { TrackedSession } from './types';

export type ForkSessionDeps = {
  findTrackedSessionById: (happySessionId: string) => TrackedSession | undefined;
  fetchServerSessionMetadata: (sessionId: string, encryptionKey: Uint8Array, encryptionVariant: 'legacy' | 'dataKey') => Promise<Metadata | null>;
  spawnTrackedHappyProcess: (options: {
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    directoryCreated?: boolean;
    message?: string;
  }) => Promise<SpawnSessionResult>;
  stat: (path: string) => Promise<{ isDirectory(): boolean }>;
  realpath: (path: string) => Promise<string>;
  runGit: (cwd: string, args: string[]) => Promise<string>;
  baseEnv: NodeJS.ProcessEnv;
};

function isPathPrefixDescendant(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  if (rel.length === 0) return true;
  if (rel.startsWith('..')) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

function parseWorktreeListPorcelain(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      paths.push(line.slice('worktree '.length));
    }
  }
  return paths;
}

function pathsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (sep === '\\') return a.toLowerCase() === b.toLowerCase();
  return false;
}

export async function forkSession(options: ForkSessionOptions, deps: ForkSessionDeps): Promise<SpawnSessionResult> {
  const { parentSessionId, worktreePath, model, permissionMode, effortLevel } = options;

  try {
    const tracked = deps.findTrackedSessionById(parentSessionId);
    if (!tracked) {
      return { type: 'error', errorMessage: `Session ${parentSessionId} is not tracked by this daemon. It may have been started before the daemon or on another machine.` };
    }
    if (!tracked.happySessionMetadataFromLocalWebhook) {
      return { type: 'error', errorMessage: `Session ${parentSessionId} has no metadata. Cannot fork.` };
    }
    if (!tracked.encryption) {
      return { type: 'error', errorMessage: `Session ${parentSessionId} has no stored encryption data. It was likely started before this feature was available. Restart the daemon and start a new session to enable fork.` };
    }

    let metadata = tracked.happySessionMetadataFromLocalWebhook;
    if (metadata.flavor !== 'codex') {
      return { type: 'error', errorMessage: `Session ${parentSessionId} uses unsupported flavor "${metadata.flavor ?? 'unknown'}". Forking is currently supported for Codex sessions only.` };
    }

    let serverMetadata: Metadata | null = null;
    try {
      serverMetadata = await deps.fetchServerSessionMetadata(parentSessionId, tracked.encryption.encryptionKey, tracked.encryption.encryptionVariant);
    } catch {
      // fall back to local cache below
    }
    if (serverMetadata) {
      metadata = serverMetadata;
      tracked.happySessionMetadataFromLocalWebhook = serverMetadata;
    }

    if (!isAbsolute(worktreePath)) {
      return { type: 'error', errorMessage: `worktreePath must be an absolute path, got: ${worktreePath}` };
    }

    const statResult = await deps.stat(worktreePath);
    if (!statResult.isDirectory()) {
      return { type: 'error', errorMessage: `worktreePath must be a directory: ${worktreePath}` };
    }

    let canonicalWorktreePath: string;
    try {
      canonicalWorktreePath = await deps.realpath(worktreePath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { type: 'error', errorMessage: `worktreePath could not be canonicalized: ${errorMessage}` };
    }

    if (!metadata.path || !isAbsolute(metadata.path)) {
      return { type: 'error', errorMessage: `Parent session ${parentSessionId} has no usable absolute path in metadata; cannot validate worktree confinement.` };
    }

    let parentRepoRoot: string;
    try {
      parentRepoRoot = (await deps.runGit(metadata.path, ['rev-parse', '--show-toplevel'])).trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { type: 'error', errorMessage: `Could not resolve parent repo root from ${metadata.path}: ${errorMessage}` };
    }
    if (!parentRepoRoot) {
      return { type: 'error', errorMessage: `Parent path ${metadata.path} is not inside a git repository.` };
    }

    let canonicalParentRepoRoot: string;
    try {
      canonicalParentRepoRoot = await deps.realpath(parentRepoRoot);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { type: 'error', errorMessage: `Parent repo root could not be canonicalized: ${errorMessage}` };
    }

    let registeredWorktreeMatch = false;
    try {
      const worktreeList = await deps.runGit(canonicalParentRepoRoot, ['worktree', 'list', '--porcelain']);
      for (const registered of parseWorktreeListPorcelain(worktreeList)) {
        let canonicalRegistered: string;
        try {
          canonicalRegistered = await deps.realpath(registered);
        } catch {
          continue;
        }
        if (pathsMatch(canonicalRegistered, canonicalWorktreePath)) {
          registeredWorktreeMatch = true;
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`[DAEMON RUN] git worktree list failed for ${canonicalParentRepoRoot}: ${errorMessage}`);
    }

    if (!registeredWorktreeMatch && !isPathPrefixDescendant(canonicalWorktreePath, canonicalParentRepoRoot)) {
      return { type: 'error', errorMessage: `worktreePath ${worktreePath} is not a registered worktree of the parent repository and is not a descendant of ${canonicalParentRepoRoot}.` };
    }

    const launch = buildResumeLaunch(
      { id: parentSessionId, active: true, metadata },
      { startedBy: 'daemon', effortLevel },
    );
    launch.cwd = canonicalWorktreePath;

    if (model) {
      launch.args.push('--model', model);
    }
    if (permissionMode) {
      launch.args.push('--permission-mode', permissionMode);
    }

    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(deps.baseEnv)) {
      if (!key.startsWith('HAPPY_RECONNECT_')) {
        env[key] = value;
      }
    }
    env[HAPPY_FORKED_FROM_SESSION_ID] = parentSessionId;

    return deps.spawnTrackedHappyProcess({
      args: launch.args,
      cwd: canonicalWorktreePath,
      env,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : (error && typeof error === 'object' ? JSON.stringify(error) : String(error));
    logger.debug(`[DAEMON RUN] Failed to fork session: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
    return {
      type: 'error',
      errorMessage: `Failed to fork session: ${errorMessage}`,
    };
  }
}
