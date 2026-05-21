import fs from 'node:fs';
import process from 'node:process';

const CHUNK_SIZE = 64 * 1024;
const DEFAULT_LAST_N = 20;
const MAX_LAST_N = 100;
const TOOL_EVENT_TYPES = new Set(['tool_use', 'tool_result']);

export type TranscriptTurn = Record<string, unknown>;

export interface TailTranscriptOptions {
  transcriptPath: string;
  lastN?: number;
  includeToolEvents?: boolean;
}

export function tailTranscript({
  transcriptPath,
  lastN = DEFAULT_LAST_N,
  includeToolEvents = false,
}: TailTranscriptOptions): TranscriptTurn[] {
  const limit = Math.min(Math.max(Math.trunc(lastN), 0), MAX_LAST_N);
  if (limit === 0) {
    return [];
  }

  const fd = fs.openSync(transcriptPath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    if (size === 0) {
      return [];
    }

    const endsWithNewline = fileEndsWithNewline(fd, size);
    const result: TranscriptTurn[] = [];
    const pending: Buffer[] = [];
    const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
    let position = size;
    let firstNonEmptyLine = true;

    const acceptLine = (line: string): void => {
      if (!line) {
        return;
      }
      const suppressWarning = firstNonEmptyLine && !endsWithNewline;
      firstNonEmptyLine = false;
      const turn = parseTranscriptLine(line, suppressWarning);
      if (!turn || (!includeToolEvents && isToolEvent(turn))) {
        return;
      }
      result.push(turn);
    };

    while (position > 0 && result.length < limit) {
      const bytesToRead = Math.min(CHUNK_SIZE, position);
      position -= bytesToRead;
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, position);
      let segmentEnd = bytesRead;

      for (let index = bytesRead - 1; index >= 0 && result.length < limit; index -= 1) {
        if (buffer[index] !== 0x0a) {
          continue;
        }
        const segment = Buffer.from(buffer.subarray(index + 1, segmentEnd));
        const line = Buffer.concat([segment, ...pending]).toString('utf8').replace(/\r$/, '');
        pending.length = 0;
        acceptLine(line);
        segmentEnd = index;
      }

      if (segmentEnd > 0) {
        pending.unshift(Buffer.from(buffer.subarray(0, segmentEnd)));
      }
    }

    if (position === 0 && pending.length > 0 && result.length < limit) {
      acceptLine(Buffer.concat(pending).toString('utf8').replace(/\r$/, ''));
    }

    return result.reverse();
  } finally {
    fs.closeSync(fd);
  }
}

function fileEndsWithNewline(fd: number, size: number): boolean {
  const lastByte = Buffer.allocUnsafe(1);
  fs.readSync(fd, lastByte, 0, 1, size - 1);
  return lastByte[0] === 0x0a;
}

function parseTranscriptLine(line: string, suppressWarning: boolean): TranscriptTurn | null {
  try {
    return JSON.parse(line) as TranscriptTurn;
  } catch (error) {
    if (!suppressWarning) {
      process.stderr.write(`overview-mcp: malformed transcript JSONL line skipped: ${formatError(error)}\n`);
    }
    return null;
  }
}

function isToolEvent(turn: TranscriptTurn): boolean {
  if (TOOL_EVENT_TYPES.has(String(turn.type))) {
    return true;
  }
  return hasToolContent(turn.content) || (isRecord(turn.message) && hasToolContent(turn.message.content));
}

function hasToolContent(content: unknown): boolean {
  return Array.isArray(content) && content.some((entry) => isRecord(entry) && TOOL_EVENT_TYPES.has(String(entry.type)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
