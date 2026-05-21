import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from './context.js';
import {
  addJournalEntryInputSchema,
  asSdkInputSchema,
  getTranscriptInputSchema,
  getTaskInputSchema,
  invokeNextInputSchema,
  listBlockersInputSchema,
  listCrewSessionsInputSchema,
  listRecommendationsInputSchema,
  listTasksInputSchema,
  nextCommandInputSchema,
  setOverrideInputSchema,
} from './schemas.js';
import type {
  AddJournalEntryInput,
  GetTranscriptInput,
  GetTaskInput,
  InvokeNextInput,
  ListCrewSessionsInput,
  ListRecommendationsInput,
  ListTasksInput,
  NextCommandInput,
  SetOverrideInput,
} from './schemas.js';
import { addJournalEntry } from './tools/add-journal-entry.js';
import { registerBuildTool } from './tools/build.js';
import { registerDevServerLogsTool } from './tools/dev-server-logs.js';
import { registerDevServerStartTool } from './tools/dev-server-start.js';
import { registerDevServerStatusTool } from './tools/dev-server-status.js';
import { registerDevServerStopTool } from './tools/dev-server-stop.js';
import { getTranscript } from './tools/get-transcript.js';
import { invokeNext } from './tools/invoke-next.js';
import { listCrewSessions } from './tools/list-crew-sessions.js';
import {
  getTask,
  listBlockers,
  listRecommendations,
  listTasks,
  nextCommand,
  toToolResult,
} from './tools/read-only.js';
import { setOverride } from './tools/set-override.js';
import { registerSyncNowTool } from './tools/sync-now.js';
import { registerSyncWatchStatusTool } from './tools/sync-watch-status.js';

export function createServer(context: ServerContext): McpServer {
  const server = new McpServer({
    name: '@codexu/overview-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'overview.list_tasks',
    {
      description: 'List Ralph overview tasks from the cached snapshot with optional filters.',
      inputSchema: asSdkInputSchema(listTasksInputSchema),
    },
    async (input) => toToolResult(await listTasks(context, input as ListTasksInput)),
  );

  server.registerTool(
    'overview.get_task',
    {
      description: 'Return one snapshot task plus the last three journal lines.',
      inputSchema: asSdkInputSchema(getTaskInputSchema),
    },
    async (input) => toToolResult(await getTask(context, input as GetTaskInput)),
  );

  server.registerTool(
    'overview.next_command',
    {
      description: 'Derive the next Ralph orchestration command for a task.',
      inputSchema: asSdkInputSchema(nextCommandInputSchema),
    },
    async (input) => toToolResult(await nextCommand(context, input as NextCommandInput)),
  );

  server.registerTool(
    'overview.invoke_next',
    {
      description: 'Return the next Ralph command or spawn a crew member to run it.',
      inputSchema: asSdkInputSchema(invokeNextInputSchema),
    },
    async (input) => toToolResult(await invokeNext(context, input as InvokeNextInput)),
  );

  server.registerTool(
    'overview.list_recommendations',
    {
      description: 'List scored Ralph recommendations from the snapshot or recommendation fallback file.',
      inputSchema: asSdkInputSchema(listRecommendationsInputSchema),
    },
    async (input) => toToolResult(await listRecommendations(context, input as ListRecommendationsInput)),
  );

  server.registerTool(
    'overview.list_blockers',
    {
      description: 'List tasks blocked by stage, open review findings, or deferred questions.',
      inputSchema: asSdkInputSchema(listBlockersInputSchema),
    },
    async () => toToolResult(await listBlockers(context)),
  );

  server.registerTool(
    'overview.list_crew_sessions',
    {
      description: 'List live Ralph crew sessions by re-reading crew manifests with a short cache.',
      inputSchema: asSdkInputSchema(listCrewSessionsInputSchema),
    },
    async (input) => toToolResult(await listCrewSessions(context, input as ListCrewSessionsInput)),
  );

  server.registerTool(
    'overview.get_transcript',
    {
      description: 'Return the tail of a live crew session transcript by sessionId.',
      inputSchema: asSdkInputSchema(getTranscriptInputSchema),
    },
    async (input) => toToolResult(await getTranscript(context, input as GetTranscriptInput)),
  );

  server.registerTool(
    'overview.add_journal_entry',
    {
      description: 'Append a free-form note to a Ralph task journal.',
      inputSchema: asSdkInputSchema(addJournalEntryInputSchema),
    },
    async (input) => toToolResult(addJournalEntry(context, input as AddJournalEntryInput)),
  );

  server.registerTool(
    'overview.set_override',
    {
      description: 'Set one ralphOverrides slug mapping in overview-data.js using AST-located source splicing.',
      inputSchema: asSdkInputSchema(setOverrideInputSchema),
    },
    async (input) => toToolResult(await setOverride(context, input as SetOverrideInput)),
  );

  registerDevServerStartTool(server, context);
  registerDevServerStopTool(server, context);
  registerDevServerStatusTool(server, context);
  registerDevServerLogsTool(server, context);
  registerBuildTool(server, context);
  registerSyncNowTool(server, context);
  registerSyncWatchStatusTool(server, context);

  return server;
}
