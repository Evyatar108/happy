import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '@/ui/logger';
import { z } from 'zod';

const StdioEntry = z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    type: z.literal('stdio').optional(),
}).passthrough();

const HttpEntry = z.object({
    url: z.string().url(),
    type: z.literal('http').optional(),
}).passthrough();

const McpServerEntry = z.union([StdioEntry, HttpEntry]).superRefine((entry, ctx) => {
    if ('command' in entry && 'url' in entry) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'MCP server entry must specify exactly one transport: command or url',
        });
    }
});

const ProjectMcpConfig = z.object({
    mcpServers: z.record(z.string(), z.unknown()),
}).passthrough();

export function loadProjectMcpServers(cwd: string): Record<string, Record<string, unknown>> {
    const path = join(cwd, '.mcp.json');
    if (!existsSync(path)) {
        return {};
    }

    let rawConfig: unknown;
    try {
        rawConfig = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        logger.warn('[codex] .mcp.json parse failed', {
            path,
            reason: error instanceof Error ? error.message : String(error),
        });
        return {};
    }

    const root = ProjectMcpConfig.safeParse(rawConfig);
    if (!root.success) {
        logger.warn('[codex] .mcp.json root shape invalid', { path, issues: root.error.issues });
        return {};
    }

    const servers: Record<string, Record<string, unknown>> = {};
    for (const [serverName, value] of Object.entries(root.data.mcpServers)) {
        if (serverName.trim().toLowerCase() === 'happy') {
            logger.warn('[codex] .mcp.json: server name "happy" is reserved for the Happy bridge — entry skipped', { path, serverName });
            continue;
        }

        const entry = McpServerEntry.safeParse(value);
        if (!entry.success) {
            logger.warn('[codex] .mcp.json server invalid', { path, serverName, issues: entry.error.issues });
            continue;
        }

        const { type: _type, ...serverConfig } = entry.data;
        servers[serverName] = serverConfig;
    }

    return servers;
}
