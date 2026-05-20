export interface OverviewTask {
  id: string;
  scope?: string;
  phase?: string;
  status?: string;
  lastTouchedAt?: string;
  command?: {
    name?: string;
    descriptionHtml?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type RalphStage =
  | 'brainstorming'
  | 'brainstorm-ready'
  | 'planning'
  | 'plan-ready'
  | 'implementing'
  | 'reviewing'
  | 'review-fix'
  | 'replan-pending'
  | 'shipped'
  | 'blocked';

export interface CrewSessionRef {
  crewName: string;
  memberName: string;
  startedAt: string;
  sessionId?: string;
  transcriptPath?: string;
  endedAt?: string;
  outcome?: string;
  summary?: string;
  _isExplicit?: boolean;
  cwd?: string;
}

export interface RalphPipelineState {
  stage: RalphStage;
  jobSlug?: string;
  groupSlug?: string;
  isParallel?: boolean;
  deferredQuestionsCount?: number;
  reviewOpenCount?: Record<string, number | undefined>;
  lastUpdatedAt?: string;
  crewSessions?: Partial<Record<RalphStage, CrewSessionRef[]>>;
  [key: string]: unknown;
}

export interface OverviewRalphState {
  generatedAt: string;
  generatedFromCommit: string;
  byTaskId: Record<string, RalphPipelineState>;
  unmatched?: Array<{ kind: string; slug: string; reason: string }>;
  unmatchedSummary?: Record<string, number>;
}

export interface SnapshotTask extends OverviewTask {
  ralph?: RalphPipelineState;
}

export interface Recommendation {
  taskId: string;
  score: number;
  stage: RalphStage;
  reasons: string[];
  [key: string]: unknown;
}

export interface NextCommand {
  label: string;
  command: string;
  icon?: string;
}

export interface OverviewData {
  generatedAt?: string;
  generatedFromCommit?: string;
  tasks?: OverviewTask[];
  ralphOverrides?: Record<string, string>;
  phaseTree?: unknown[];
  cadence?: Record<string, string>;
  effort?: Record<string, number>;
  lastTouched?: Record<string, string>;
  periodic?: Record<string, unknown>;
  risk?: Record<string, string>;
  runs?: unknown[];
  sizeBucket?: Record<string, string>;
  spawnedFrom?: Record<string, string>;
  workstream?: Record<string, string>;
}

export interface Snapshot extends OverviewData {
  generatedAt: string;
  generatedFromCommit: string;
  schemaVersion: 1;
  tasks: SnapshotTask[];
  runs: unknown[];
  recommendations?: Recommendation[];
  dependencyGraph: { nodes: unknown[]; edges: unknown[] };
  runDurations: Record<string, number>;
  unmatched: Array<{ kind: string; slug: string; reason: string }>;
  unmatchedSummary: Record<string, number>;
}
