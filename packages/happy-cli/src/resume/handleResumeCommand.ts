import { existsSync } from 'node:fs';

import type { Metadata } from '@/api/types';
import { spawnHappyCLI } from '@/utils/spawnHappyCLI';

import { resolveHappySession, type ResumableHappySession } from './resolveHappySession';

export type ResumeLaunch = {
    cwd: string;
    args: string[];
};

export type ResumeLaunchOptions = {
    claudeStartingMode?: 'local' | 'remote';
    startedBy?: 'daemon' | 'terminal';
    effortLevel?: string;
};

export function parseResumeCommandArgs(args: string[]): { showHelp: boolean; sessionId: string; effortLevel?: string } {
    if (args.includes('-h') || args.includes('--help')) {
        return {
            showHelp: true,
            sessionId: '',
        };
    }

    const remainingArgs: string[] = [];
    let effortLevel: string | undefined;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--effort') {
            if (effortLevel !== undefined) {
                throw new Error('Resume effort can only be provided once.');
            }
            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                throw new Error('Resume effort requires a value: happy resume <session-id> --effort <level>');
            }
            effortLevel = nextArg;
            i++;
            continue;
        }

        if (arg.startsWith('--effort=')) {
            if (effortLevel !== undefined) {
                throw new Error('Resume effort can only be provided once.');
            }
            const value = arg.slice('--effort='.length).trim();
            if (!value) {
                throw new Error('Resume effort requires a value: happy resume <session-id> --effort <level>');
            }
            effortLevel = value;
            continue;
        }

        remainingArgs.push(arg);
    }

    if (remainingArgs.length === 0) {
        throw new Error('Happy session ID is required: happy resume <session-id>');
    }
    if (remainingArgs.length > 1) {
        throw new Error(`Unexpected arguments for happy resume: ${remainingArgs.slice(1).join(' ')}`);
    }

    return {
        showHelp: false,
        sessionId: remainingArgs[0],
        effortLevel,
    };
}

function resolveFlavor(metadata: Metadata): 'codex' | 'claude' | null {
    if (metadata.flavor === 'codex' || metadata.codexThreadId) {
        return 'codex';
    }
    if (metadata.flavor === 'claude' || metadata.claudeSessionId) {
        return 'claude';
    }
    return null;
}

export function buildResumeLaunch(session: ResumableHappySession, options: ResumeLaunchOptions = {}): ResumeLaunch {
    const { metadata } = session;
    const flavor = resolveFlavor(metadata);

    if (flavor === 'codex') {
        if (!metadata.codexThreadId) {
            throw new Error(`Happy session ${session.id} is missing its Codex thread ID.`);
        }
        const args = ['codex', '--resume', metadata.codexThreadId];
        if (options.startedBy) {
            args.push('--started-by', options.startedBy);
        }
        if (options.effortLevel) {
            args.push('--effort', options.effortLevel);
        }
        return {
            cwd: metadata.path,
            args,
        };
    }

    if (flavor === 'claude') {
        if (!metadata.claudeSessionId) {
            throw new Error(`Happy session ${session.id} is missing its Claude session ID.`);
        }
        const args = ['claude'];
        if (options.claudeStartingMode) {
            args.push('--happy-starting-mode', options.claudeStartingMode);
        }
        if (options.startedBy) {
            args.push('--started-by', options.startedBy);
        }
        args.push('--resume', metadata.claudeSessionId);
        return {
            cwd: metadata.path,
            args,
        };
    }

    throw new Error(`Happy session ${session.id} uses unsupported flavor "${metadata.flavor ?? 'unknown'}".`);
}

export function formatResumeHelp(): string {
    return [
        'happy resume - Resume a previous Happy session',
        '',
        'Usage:',
        '  happy resume <happy-session-id>',
        '',
        'Examples:',
        '  happy resume cmmij8olq00dp5jcxr3wtbpau',
        '  happy resume cmmij8',
        '',
        'This reuses the saved worktree/path and resumes the underlying agent session',
        'when the backend supports it.',
    ].join('\n');
}

function spawnResumeChild(launch: ResumeLaunch): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawnHappyCLI(launch.args, {
            cwd: launch.cwd,
            env: process.env,
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`Resumed session exited via signal ${signal}`));
                return;
            }
            resolve(code);
        });
    });
}

export async function handleResumeCommand(args: string[]): Promise<void> {
    const parsed = parseResumeCommandArgs(args);
    if (parsed.showHelp) {
        console.log(formatResumeHelp());
        return;
    }

    const session = await resolveHappySession(parsed.sessionId);
    const launch = buildResumeLaunch(session, { effortLevel: parsed.effortLevel });

    if (!existsSync(launch.cwd)) {
        throw new Error(`Saved session path does not exist: ${launch.cwd}`);
    }

    const exitCode = await spawnResumeChild(launch);
    if (typeof exitCode === 'number' && exitCode !== 0) {
        process.exit(exitCode);
    }
}
