import { isAbsolute } from 'path';

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
  baseEnv: NodeJS.ProcessEnv;
};

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

    const launch = buildResumeLaunch(
      { id: parentSessionId, active: true, metadata },
      { startedBy: 'daemon', effortLevel },
    );
    launch.cwd = worktreePath;

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
      cwd: worktreePath,
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
