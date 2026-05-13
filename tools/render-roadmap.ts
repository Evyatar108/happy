import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Intentional src-path import: root-level tools/*.ts run outside pnpm workspace module
// resolution so @slopus/happy-wire is not resolvable here without extra wiring. Importing
// the TypeScript source directly is the approved pattern for this directory (see progress.txt).
import { LedgerRecordSchema, type LedgerRecord } from '../packages/happy-wire/src/ledger';

export const RALPH_RENDER_SECTION_START = '<!-- ralph-render-section:start -->';
export const RALPH_RENDER_SECTION_END = '<!-- ralph-render-section:end -->';

type SortableRecord = {
  record: LedgerRecord;
  seqSort: number;
};

type RenderRoadmapOptions = {
  rootDir?: string;
  runId: string;
};

type ArchiveRoadmapOptions = {
  rootDir?: string;
  runId: string;
};

function runStartMarker(runId: string): string {
  return `<!-- ralph-render:start runId=${runId} -->`;
}

function runEndMarker(runId: string): string {
  return `<!-- ralph-render:end runId=${runId} -->`;
}

function roadmapPath(rootDir: string): string {
  return join(rootDir, 'plans', 'codexu-roadmap.md');
}

function ledgerRunDir(rootDir: string, runId: string): string {
  return join(rootDir, '.ralph', 'state', runId);
}

function archivePath(rootDir: string, runId: string): string {
  return join(rootDir, '.ralph', 'state', 'archive', runId, 'rendered.md');
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function inlineCode(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

function summarizeRecord(record: LedgerRecord): string {
  switch (record.eventType) {
    case 'spawn':
      return [
        `${record.agent} spawned`,
        `project ${inlineCode(record.projectPath)}`,
        `worktree ${inlineCode(record.worktreePath)}`,
        record.branchName ? `branch ${inlineCode(record.branchName)}` : null,
      ].filter(Boolean).join('; ');
    case 'message-sent':
      return [record.direction, record.messagePreview].filter(Boolean).join(': ');
    case 'idle-reached':
      return `queueDepth=${record.queueDepth}`;
    case 'pending-permission':
      return record.requestIds.length > 0
        ? `requests ${record.requestIds.map(inlineCode).join(', ')}`
        : 'no pending request ids';
    case 'last-output-summary':
      return `${record.heuristic}: ${record.summary}`;
    case 'validation-attached':
      return `${record.testReference}; ${record.verificationUrl}`;
    case 'done':
      return [
        record.scopeSummary,
        `tests: ${record.testReference}`,
        `url: ${record.verificationUrl}`,
        record.caveats.length > 0 ? `caveats: ${record.caveats.join('; ')}` : 'caveats: none',
      ].join('; ');
    case 'error':
      return `${record.errorCode}: ${record.errorMessage}`;
  }
}

export async function readLedgerRecords(rootDir: string, runId: string): Promise<LedgerRecord[]> {
  const dir = ledgerRunDir(rootDir, runId);
  const entries = await readdir(dir, { withFileTypes: true });
  const safeSessionId = /^[A-Za-z0-9_-]+$/;
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl') && safeSessionId.test(entry.name.slice(0, -'.jsonl'.length)))
    .map((entry) => entry.name)
    .sort();
  const records: SortableRecord[] = [];

  for (const file of files) {
    const content = await readFile(join(dir, file), 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const sessionId = file.slice(0, -'.jsonl'.length);
    lines.forEach((line, index) => {
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(line);
      } catch {
        const errorRecord: LedgerRecord = {
          runId,
          sessionId,
          timestamp: '1970-01-01T00:00:00.000Z',
          eventType: 'error',
          errorCode: 'ledger-write-failed',
          errorMessage: `malformed record at line ${index + 1}: invalid JSON`,
        };
        records.push({ record: errorRecord, seqSort: index });
        return;
      }
      const result = LedgerRecordSchema.safeParse(rawJson);
      if (!result.success) {
        const errorRecord: LedgerRecord = {
          runId,
          sessionId,
          timestamp: '1970-01-01T00:00:00.000Z',
          eventType: 'error',
          errorCode: 'ledger-write-failed',
          errorMessage: `malformed record at line ${index + 1}: ${result.error.message}`,
        };
        records.push({ record: errorRecord, seqSort: index });
        return;
      }
      const parsed = result.data;
      records.push({
        record: parsed,
        seqSort: parsed.seqWithinSession ?? index,
      });
    });
  }

  return records
    .sort((left, right) => {
      const byTimestamp = left.record.timestamp.localeCompare(right.record.timestamp);
      if (byTimestamp !== 0) return byTimestamp;
      const bySession = left.record.sessionId.localeCompare(right.record.sessionId);
      if (bySession !== 0) return bySession;
      return left.seqSort - right.seqSort;
    })
    .map(({ record }) => record);
}

export function renderRunMarkdown(runId: string, records: LedgerRecord[]): string {
  const lines = [
    runStartMarker(runId),
    `### Fan-Out Run ${inlineCode(runId)}`,
    '',
    `Records: ${records.length}`,
    '',
    '| Timestamp | Session | Event | Summary |',
    '|---|---|---|---|',
  ];

  for (const record of records) {
    const cells = [
      escapeMarkdownTableCell(record.timestamp),
      escapeMarkdownTableCell(inlineCode(record.sessionId)),
      escapeMarkdownTableCell(inlineCode(record.eventType)),
      escapeMarkdownTableCell(summarizeRecord(record)),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }

  lines.push(runEndMarker(runId));
  return `${lines.join('\n')}\n`;
}

function ensureRenderSection(roadmap: string): string {
  if (roadmap.includes(RALPH_RENDER_SECTION_START) && roadmap.includes(RALPH_RENDER_SECTION_END)) {
    return roadmap;
  }

  const suffix = [
    '',
    '## Ralph Rendered Fan-Out Runs',
    '',
    RALPH_RENDER_SECTION_START,
    RALPH_RENDER_SECTION_END,
    '',
  ].join('\n');
  return `${roadmap.replace(/\s*$/, '\n')}${suffix}`;
}

function replaceOrAppendRunRegion(roadmap: string, runId: string, renderedRegion: string): string {
  const sectioned = ensureRenderSection(roadmap);
  const start = runStartMarker(runId);
  const end = runEndMarker(runId);
  const existingStart = sectioned.indexOf(start);

  if (existingStart >= 0) {
    const existingEnd = sectioned.indexOf(end, existingStart);
    if (existingEnd < 0) {
      throw new Error(`Found ${start} without matching ${end}`);
    }
    const afterExistingEnd = existingEnd + end.length;
    const regionEnd = sectioned.slice(afterExistingEnd).startsWith('\n') ? afterExistingEnd + 1 : afterExistingEnd;
    return `${sectioned.slice(0, existingStart)}${renderedRegion}${sectioned.slice(regionEnd)}`;
  }

  const sectionEndIndex = sectioned.indexOf(RALPH_RENDER_SECTION_END);
  if (sectionEndIndex < 0) {
    throw new Error(`Missing ${RALPH_RENDER_SECTION_END}`);
  }
  const before = sectioned.slice(0, sectionEndIndex).replace(/\s*$/, '\n\n');
  const after = sectioned.slice(sectionEndIndex);
  return `${before}${renderedRegion}\n${after}`;
}

function removeRunRegion(roadmap: string, runId: string): { nextRoadmap: string; removedRegion: string } {
  const start = runStartMarker(runId);
  const end = runEndMarker(runId);
  const existingStart = roadmap.indexOf(start);
  if (existingStart < 0) {
    throw new Error(`No rendered region found for runId ${runId}`);
  }
  const existingEnd = roadmap.indexOf(end, existingStart);
  if (existingEnd < 0) {
    throw new Error(`Found ${start} without matching ${end}`);
  }
  const afterExistingEnd = existingEnd + end.length;
  const regionEnd = roadmap.slice(afterExistingEnd).startsWith('\n') ? afterExistingEnd + 1 : afterExistingEnd;
  const removedRegion = roadmap.slice(existingStart, regionEnd);
  return {
    nextRoadmap: `${roadmap.slice(0, existingStart).replace(/\s*$/, '\n\n')}${roadmap.slice(regionEnd).replace(/^\s*/, '')}`,
    removedRegion,
  };
}

export async function renderRoadmap(options: RenderRoadmapOptions): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const records = await readLedgerRecords(rootDir, options.runId);
  const renderedRegion = renderRunMarkdown(options.runId, records);
  const path = roadmapPath(rootDir);
  const currentRoadmap = await readFile(path, 'utf8');
  await writeFile(path, replaceOrAppendRunRegion(currentRoadmap, options.runId, renderedRegion), 'utf8');
}

export async function archiveRoadmapRun(options: ArchiveRoadmapOptions): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const path = roadmapPath(rootDir);
  const currentRoadmap = await readFile(path, 'utf8');
  const { nextRoadmap, removedRegion } = removeRunRegion(currentRoadmap, options.runId);
  const target = archivePath(rootDir, options.runId);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, removedRegion, 'utf8');
  await writeFile(path, nextRoadmap, 'utf8');
}

type CliArgs = {
  rootDir?: string;
  runId?: string;
  archiveRunId?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') {
      args.rootDir = argv[++index];
    } else if (arg === '--runId') {
      args.runId = argv[++index];
    } else if (arg === '--archive') {
      args.archiveRunId = argv[++index];
    } else if (!arg.startsWith('-') && !args.runId) {
      args.runId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.archiveRunId) {
    await archiveRoadmapRun({ rootDir: args.rootDir, runId: args.archiveRunId });
    return;
  }
  if (!args.runId) {
    throw new Error('Usage: tsx tools/render-roadmap.ts --runId <id> [--root <path>] or --archive <id>');
  }
  await renderRoadmap({ rootDir: args.rootDir, runId: args.runId });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
