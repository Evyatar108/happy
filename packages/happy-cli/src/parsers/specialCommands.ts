/**
 * Parsers for special commands that require dedicated remote session handling
 */

export interface CompactCommandResult {
    isCompact: boolean;
    originalMessage: string;
    contextBoundaryKind?: 'compact';
}

export interface ClearCommandResult {
    isClear: boolean;
}

export interface SpecialCommandResult {
    type: 'compact' | 'clear' | null;
    originalMessage?: string;
    contextBoundaryKind?: 'compact';
}

/**
 * Parse /compact command
 * Matches messages starting with "/compact " or exactly "/compact",
 * AND the Claude Code-wrapped form `<command-name>/compact</command-name>...`
 * which the SDK / TUI emits when a slash command is forwarded through the
 * SESSION_SCANNER ingestion path. Without the wrapped-form check, /compact
 * typed on the tablet (or in interactive mode) reaches the CLI as the
 * wrapped XML envelope and slips past the typed-boundary emission.
 */
export function parseCompact(message: string): CompactCommandResult {
    const trimmed = message.trim();

    if (trimmed === '/compact' || trimmed.startsWith('/compact ')) {
        return {
            isCompact: true,
            originalMessage: trimmed,
            contextBoundaryKind: 'compact'
        };
    }

    if (trimmed.startsWith('<command-name>/compact</command-name>')) {
        return {
            isCompact: true,
            originalMessage: trimmed,
            contextBoundaryKind: 'compact'
        };
    }

    return {
        isCompact: false,
        originalMessage: message
    };
}

/**
 * Parse /clear command
 * Matches the literal `/clear` AND the Claude Code-wrapped form
 * `<command-name>/clear</command-name>...`. The wrapped form is what the
 * tablet sends through Claude Code's SDK (and what interactive Claude Code
 * writes to its JSONL when the user types /clear in the TUI).
 */
export function parseClear(message: string): ClearCommandResult {
    const trimmed = message.trim();

    if (trimmed === '/clear') {
        return { isClear: true };
    }

    if (trimmed.startsWith('<command-name>/clear</command-name>')) {
        return { isClear: true };
    }

    return { isClear: false };
}

/**
 * Unified parser for special commands
 * Returns the type of command and original message if applicable
 */
export function parseSpecialCommand(message: string): SpecialCommandResult {
    const compactResult = parseCompact(message);
    if (compactResult.isCompact) {
        return {
            type: 'compact',
            originalMessage: compactResult.originalMessage,
            contextBoundaryKind: compactResult.contextBoundaryKind
        };
    }
    
    const clearResult = parseClear(message);
    if (clearResult.isClear) {
        return {
            type: 'clear'
        };
    }
    
    return {
        type: null
    };
}
