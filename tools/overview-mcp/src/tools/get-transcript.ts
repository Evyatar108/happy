import path from 'node:path';

import type { ServerContext } from '../context.js';
import type { GetTranscriptInput } from '../schemas.js';
import { tailTranscript } from '../utils/transcript-tail.js';
import type { TranscriptTurn } from '../utils/transcript-tail.js';
import { listCrewSessions } from './list-crew-sessions.js';
import type { ToolEnvelope } from './read-only.js';

export async function getTranscript(
  context: ServerContext,
  input: GetTranscriptInput,
): Promise<ToolEnvelope<TranscriptTurn[]>> {
  const sessions = await listCrewSessions(context, {});
  if (!sessions.ok) {
    return sessions;
  }

  const session = sessions.data.find((candidate) => candidate.sessionId === input.sessionId);
  if (!session?.transcriptPath) {
    return { ok: false, error: 'session not found' };
  }

  return {
    ok: true,
    data: tailTranscript({
      transcriptPath: resolveTranscriptPath(context.repoRoot, session.transcriptPath),
      lastN: input.lastN,
      includeToolEvents: input.includeToolEvents,
    }),
  };
}

function resolveTranscriptPath(repoRoot: string, transcriptPath: string): string {
  return path.isAbsolute(transcriptPath) ? transcriptPath : path.resolve(repoRoot, transcriptPath);
}
