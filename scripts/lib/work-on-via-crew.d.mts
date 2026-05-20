import type { RalphOverviewConfig } from './default-config.mjs';

export interface CrewSessionRefResult {
  crewName: string;
  memberName: string;
  stage: string;
  taskId: string;
  sessionId: string | null;
  ref: {
    crewName: string;
    memberName: string;
    cwd: string;
    startedAt: string;
    sessionId?: string;
    transcriptPath?: string;
  };
}

export function runWorkOnViaCrew(options?: {
  repoRoot?: string;
  config?: RalphOverviewConfig;
  taskId?: string;
  stage?: string;
  crewName?: string;
  now?: () => Date;
  execFileSyncImpl?: unknown;
  spawnSyncImpl?: unknown;
  sleep?: (ms: number) => Promise<void>;
  stdout?: NodeJS.WritableStream;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  memberName?: string;
  spawnMemberCli?: string;
}): Promise<CrewSessionRefResult>;
