/**
 * Generate temporary settings file with Claude hooks for session tracking
 *
 * Creates a settings.json file that configures Claude's SessionStart hook
 * to notify our HTTP server when sessions change (new session, resume, compact, etc.)
 *
 * This file is passed to Claude Code via `--settings <path>`. Since v0.13.0 that
 * flag has been observed to override plugin/MCP activation fields from the
 * user's `~/.claude/settings.json`, with the practical effect that plugin-
 * provided skills silently disappear. To preserve those skills we copy a small
 * allowlist of plugin/MCP-related fields from the user's settings into the
 * tmpfile, and merge any user SessionStart hooks with Happy's own hook rather
 * than replacing them.
 *
 * The allowlist is intentionally narrow: we do NOT forward `env`,
 * `apiKeyHelper`, `theme`, `model`, etc., because those can contain secrets,
 * because `--settings` is unlikely to need them, and because forwarding
 * everything would make any future Claude settings field silently flow through.
 *
 * See https://github.com/slopus/happy/issues/779.
 */

import { join, resolve } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';
import { readClaudeSettings, type ClaudeSettings } from './claudeSettings';

/**
 * User-settings fields that `--settings` is known to mask. Kept narrow on
 * purpose — add a field here only when there's a concrete bug report that
 * demonstrates `--settings` breaks it.
 */
const USER_SETTINGS_PASSTHROUGH_KEYS = [
    'enabledPlugins',
    'enabledMcpjsonServers',
    'disabledMcpjsonServers',
    'mcpServers',
] as const;

/**
 * Build the settings object that will be written to the hook settings file.
 *
 * Exported for testing. Given the user's Claude settings (or null if absent)
 * and the hook command string, returns a merged object where:
 *  - the narrow allowlist of plugin/MCP fields is copied from the user,
 *  - any user SessionStart hooks are preserved and Happy's hook is appended,
 *  - all other user fields (including potentially sensitive ones like `env`
 *    and `apiKeyHelper`) are deliberately NOT copied.
 */
export function buildHookSettings(
    userSettings: ClaudeSettings | null,
    hookCommand: string,
): Record<string, any> {
    const happyHookEntry = {
        matcher: '*',
        hooks: [
            {
                type: 'command',
                command: hookCommand,
            },
        ],
    };

    const base = (userSettings ?? {}) as Record<string, any>;
    const userHooks = (base.hooks && typeof base.hooks === 'object' && !Array.isArray(base.hooks))
        ? (base.hooks as Record<string, any[]>)
        : {};
    const userSessionStart = Array.isArray(userHooks.SessionStart) ? userHooks.SessionStart : [];

    const result: Record<string, any> = {
        hooks: {
            ...userHooks,
            SessionStart: [...userSessionStart, happyHookEntry],
        },
    };

    for (const key of USER_SETTINGS_PASSTHROUGH_KEYS) {
        if (base[key] !== undefined) {
            result[key] = base[key];
        }
    }

    return result;
}

/**
 * Generate a temporary settings file with SessionStart hook configuration
 *
 * @param port - The port where Happy server is listening
 * @returns Path to the generated settings file
 */
export function generateHookSettingsFile(port: number): string {
    const hooksDir = join(configuration.happyHomeDir, 'tmp', 'hooks');
    mkdirSync(hooksDir, { recursive: true });

    // Unique filename per process to avoid conflicts
    const filename = `session-hook-${process.pid}.json`;
    const filepath = join(hooksDir, filename);

    // Path to the hook forwarder script
    const forwarderScript = resolve(projectPath(), 'scripts', 'session_hook_forwarder.cjs');
    const hookCommand = `node "${forwarderScript}" ${port}`;

    const settings = buildHookSettings(readClaudeSettings(), hookCommand);

    writeFileSync(filepath, JSON.stringify(settings, null, 2));
    logger.debug(`[generateHookSettings] Created hook settings file: ${filepath}`);

    return filepath;
}

/**
 * Clean up the temporary hook settings file
 *
 * @param filepath - Path to the settings file to remove
 */
export function cleanupHookSettingsFile(filepath: string): void {
    try {
        if (existsSync(filepath)) {
            unlinkSync(filepath);
            logger.debug(`[generateHookSettings] Cleaned up hook settings file: ${filepath}`);
        }
    } catch (error) {
        logger.debug(`[generateHookSettings] Failed to cleanup hook settings file: ${error}`);
    }
}
