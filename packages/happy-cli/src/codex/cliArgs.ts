import type { ReasoningEffort } from './codexAppServerTypes';

export type CodexTransportFlag = 'stdio' | 'ws';

const VALID_CODEX_EFFORT_LEVELS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function parseCodexEffort(value: string): ReasoningEffort {
    const normalized = value.trim();
    if (VALID_CODEX_EFFORT_LEVELS.includes(normalized as ReasoningEffort)) {
        return normalized as ReasoningEffort;
    }
    throw new Error('Codex effort must be one of: none, minimal, low, medium, high, xhigh');
}

export function extractCodexResumeFlag(args: string[]): { resumeThreadId: string | null; args: string[] } {
    const remainingArgs: string[] = [];
    let resumeThreadId: string | null = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--resume' || arg === '-r') {
            if (resumeThreadId !== null) {
                throw new Error('Codex resume flag can only be provided once.');
            }

            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Codex resume requires a thread ID: happy codex --resume <thread-id>');
            }

            resumeThreadId = nextArg;
            i++;
            continue;
        }

        if (arg.startsWith('--resume=')) {
            if (resumeThreadId !== null) {
                throw new Error('Codex resume flag can only be provided once.');
            }

            const value = arg.slice('--resume='.length).trim();
            if (!value) {
                throw new Error('Codex resume requires a thread ID: happy codex --resume <thread-id>');
            }

            resumeThreadId = value;
            continue;
        }

        remainingArgs.push(arg);
    }

    return {
        resumeThreadId,
        args: remainingArgs,
    };
}

export function extractCodexEffortFlag(args: string[]): { effortLevel: ReasoningEffort | undefined; args: string[] } {
    const remainingArgs: string[] = [];
    let effortLevel: ReasoningEffort | undefined = undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--effort') {
            if (effortLevel !== undefined) {
                throw new Error('Codex effort flag can only be provided once.');
            }

            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Codex effort requires a value: happy codex --effort <level>');
            }

            effortLevel = parseCodexEffort(nextArg);
            i++;
            continue;
        }

        if (arg.startsWith('--effort=')) {
            if (effortLevel !== undefined) {
                throw new Error('Codex effort flag can only be provided once.');
            }

            effortLevel = parseCodexEffort(arg.slice('--effort='.length));
            continue;
        }

        remainingArgs.push(arg);
    }

    return {
        effortLevel,
        args: remainingArgs,
    };
}

export function extractCodexTransportFlag(args: string[]): { transport: CodexTransportFlag | undefined; args: string[] } {
    const remainingArgs: string[] = [];
    let transport: CodexTransportFlag | undefined = undefined;

    const parseTransport = (value: string): CodexTransportFlag => {
        const normalized = value.trim();
        if (normalized === 'stdio' || normalized === 'ws') {
            return normalized;
        }
        throw new Error('Codex transport must be one of: stdio, ws');
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--codex-transport') {
            if (transport !== undefined) {
                throw new Error('Codex transport flag can only be provided once.');
            }

            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Codex transport requires a value: happy codex --codex-transport <stdio|ws>');
            }

            transport = parseTransport(nextArg);
            i++;
            continue;
        }

        if (arg.startsWith('--codex-transport=')) {
            if (transport !== undefined) {
                throw new Error('Codex transport flag can only be provided once.');
            }

            transport = parseTransport(arg.slice('--codex-transport='.length));
            continue;
        }

        remainingArgs.push(arg);
    }

    return {
        transport,
        args: remainingArgs,
    };
}
