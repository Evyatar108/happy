#!/usr/bin/env node
import process from 'node:process';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { buildContext } from './context.js';
import { createServer } from './server.js';

const context = buildContext();
const server = createServer(context);
const transport = new StdioServerTransport();

let closing = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  process.stderr.write(`overview-mcp: received ${signal}; shutting down\n`);
  await context.snapshotReader.close();
  try {
    await context.processManager.stopAll();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`overview-mcp: failed to stop child processes: ${message}\n`);
  }
  await server.close();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

context.snapshotReader.start();
await server.connect(transport);
process.stderr.write('overview-mcp: connected\n');
