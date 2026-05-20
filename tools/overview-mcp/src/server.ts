import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from './context.js';

export function createServer(_context: ServerContext): McpServer {
  return new McpServer({
    name: '@codexu/overview-mcp',
    version: '0.1.0',
  });
}
