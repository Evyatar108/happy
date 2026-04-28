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
 * Matches messages starting with "/compact " or exactly "/compact"
 */
export function parseCompact(message: string): CompactCommandResult {
    const trimmed = message.trim();
    
    if (trimmed === '/compact') {
        return {
            isCompact: true,
            originalMessage: trimmed,
            contextBoundaryKind: 'compact'
        };
    }
    
    if (trimmed.startsWith('/compact ')) {
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
 * Only matches exactly "/clear"
 */
export function parseClear(message: string): ClearCommandResult {
    const trimmed = message.trim();
    
    return {
        isClear: trimmed === '/clear'
    };
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
