export interface OverviewTask {
  id: string;
  [key: string]: unknown;
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
  tasks: OverviewTask[];
  runs: unknown[];
  recommendations: unknown[];
  dependencyGraph: { nodes: unknown[]; edges: unknown[] };
  runDurations: Record<string, number>;
  unmatched: Array<{ kind: string; slug: string; reason: string }>;
  unmatchedSummary: Record<string, number>;
}
