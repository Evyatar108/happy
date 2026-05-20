import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';

import type { ServerContext } from './context.js';
import {
  addJournalEntryInputSchema,
  getTaskInputSchema,
  listBlockersInputSchema,
  listRecommendationsInputSchema,
  listTasksInputSchema,
  nextCommandInputSchema,
} from './schemas.js';
import type { AddJournalEntryInput, GetTaskInput, ListRecommendationsInput, ListTasksInput, NextCommandInput } from './schemas.js';
import { addJournalEntry } from './tools/add-journal-entry.js';
import {
  getTask,
  listBlockers,
  listRecommendations,
  listTasks,
  nextCommand,
  toToolResult,
} from './tools/read-only.js';

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
    'overview.add_journal_entry',
    {
      description: 'Append a free-form note to a Ralph task journal.',
      inputSchema: asSdkInputSchema(addJournalEntryInputSchema),
    },
    async (input) => toToolResult(addJournalEntry(context, input as AddJournalEntryInput)),
  );

  return server;
}

function asSdkInputSchema(schema: object): ZodRawShapeCompat {
  return schema as unknown as ZodRawShapeCompat;
}
