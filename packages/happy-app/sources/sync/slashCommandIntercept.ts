export type InterceptMessageKey =
    | 'pluginRequiresSession'
    | 'skillsRequiresSession'
    | 'agentsRequiresSession'
    | 'memoryTerminalOnly'
    | 'modelTerminalOnly'
    | 'mcpTerminalOnly'
    | 'helpTerminalOnly';

export type InterceptResult =
    | { type: 'route'; path: string }
    | { type: 'alert'; messageKey: InterceptMessageKey }
    | null;

const SESSION_ROUTE_COMMANDS = {
    plugin: {
        path: (sessionId: string) => `/session/${sessionId}/plugins`,
        fallback: 'pluginRequiresSession',
    },
    skills: {
        path: (sessionId: string) => `/session/${sessionId}/skills`,
        fallback: 'skillsRequiresSession',
    },
    agents: {
        path: (sessionId: string) => `/session/${sessionId}/agents`,
        fallback: 'agentsRequiresSession',
    },
} as const;

const TERMINAL_ONLY_COMMANDS = {
    memory: 'memoryTerminalOnly',
    model: 'modelTerminalOnly',
    mcp: 'mcpTerminalOnly',
    help: 'helpTerminalOnly',
} as const;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function getSlashCommandName(command: string): string | null {
    const trimmed = command.trim();
    if (!trimmed.startsWith('/')) {
        return null;
    }

    const [slashCommand] = trimmed.split(/\s+/, 1);
    return slashCommand.slice(1) || null;
}

export function maybeIntercept(command: string, sessionId: string | undefined): InterceptResult {
    const slashCommand = getSlashCommandName(command);
    if (!slashCommand) {
        return null;
    }

    const routeCommand = SESSION_ROUTE_COMMANDS[slashCommand as keyof typeof SESSION_ROUTE_COMMANDS];
    if (routeCommand) {
        if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
            return { type: 'alert', messageKey: routeCommand.fallback };
        }

        return { type: 'route', path: routeCommand.path(sessionId) };
    }

    const terminalOnlyMessage = TERMINAL_ONLY_COMMANDS[slashCommand as keyof typeof TERMINAL_ONLY_COMMANDS];
    if (terminalOnlyMessage) {
        return { type: 'alert', messageKey: terminalOnlyMessage };
    }

    return null;
}
