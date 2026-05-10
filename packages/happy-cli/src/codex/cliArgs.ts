import type { PermissionMode } from '@/api/types';
import type { ReasoningEffort } from './codexAppServerTypes';

export type CodexTransportFlag = 'stdio' | 'ws';

export const VALID_CODEX_EFFORT_LEVELS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export const VALID_CODEX_REMOTE_PERMISSION_MODES: readonly PermissionMode[] = [
    'default',
    'read-only',
    'safe-yolo',
    'yolo',
];

export function isValidCodexEffortLevel(value: unknown): value is ReasoningEffort {
    return typeof value === 'string' && VALID_CODEX_EFFORT_LEVELS.includes(value as ReasoningEffort);
}

export function isValidCodexRemotePermissionMode(value: unknown): value is PermissionMode {
    return typeof value === 'string' && VALID_CODEX_REMOTE_PERMISSION_MODES.includes(value as PermissionMode);
}

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

export function extractCodexModelFlag(args: string[]): { model: string | undefined; args: string[] } {
    const remainingArgs: string[] = [];
    let model: string | undefined = undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--model') {
            if (model !== undefined) {
                throw new Error('Codex model flag can only be provided once.');
            }

            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Codex model requires a value: happy codex --model <model>');
            }

            model = nextArg;
            i++;
            continue;
        }

        if (arg.startsWith('--model=')) {
            if (model !== undefined) {
                throw new Error('Codex model flag can only be provided once.');
            }

            const value = arg.slice('--model='.length).trim();
            if (!value) {
                throw new Error('Codex model requires a value: happy codex --model <model>');
            }

            model = value;
            continue;
        }

        remainingArgs.push(arg);
    }

    return {
        model,
        args: remainingArgs,
    };
}

export function extractCodexPermissionModeFlag(args: string[]): { permissionMode: string | undefined; args: string[] } {
    const remainingArgs: string[] = [];
    let permissionMode: string | undefined = undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--permission-mode') {
            if (permissionMode !== undefined) {
                throw new Error('Codex permission-mode flag can only be provided once.');
            }

            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Codex permission-mode requires a value: happy codex --permission-mode <mode>');
            }

            permissionMode = nextArg;
            i++;
            continue;
        }

        if (arg.startsWith('--permission-mode=')) {
            if (permissionMode !== undefined) {
                throw new Error('Codex permission-mode flag can only be provided once.');
            }

            const value = arg.slice('--permission-mode='.length).trim();
            if (!value) {
                throw new Error('Codex permission-mode requires a value: happy codex --permission-mode <mode>');
            }

            permissionMode = value;
            continue;
        }

        remainingArgs.push(arg);
    }

    return {
        permissionMode,
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
