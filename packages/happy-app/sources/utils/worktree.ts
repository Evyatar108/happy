/**
 * Git worktree operations: create, list, remove
 */

import { machineBash } from '@/sync/ops';

/** Relative path prefix where worktrees are stored inside a repo */
export const WORKTREE_DIR = '.dev/worktree';

/** Absolute path marker used to detect worktree paths */
export const WORKTREE_PATH_MARKER = `/${WORKTREE_DIR}/`;

// --- Name generation ---

export function generateWorktreeName(): string {
    return `ralph-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

// --- Operations ---

export async function createWorktree(
    machineId: string,
    basePath: string
): Promise<{
    success: boolean;
    worktreePath: string;
    branchName: string;
    error?: string;
}> {
    // Check if it's a git repository
    const gitCheck = await machineBash(
        machineId,
        'git rev-parse --git-dir',
        basePath
    );

    if (!gitCheck.success) {
        // exitCode -1 means the RPC call itself failed (network, daemon offline, etc.)
        // Don't mask it as "Not a Git repository"
        const isRpcFailure = gitCheck.exitCode === -1;
        return {
            success: false,
            worktreePath: '',
            branchName: '',
            error: isRpcFailure
                ? (gitCheck.stderr || 'Failed to connect to machine')
                : 'Not a Git repository'
        };
    }

    let result: Awaited<ReturnType<typeof machineBash>> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
        const name = generateWorktreeName();
        const worktreePath = `${WORKTREE_DIR}/${name}`;
        result = await machineBash(
            machineId,
            `git worktree add -b ${name} ${worktreePath}`,
            basePath
        );

        if (result.success) {
            return {
                success: true,
                worktreePath: `${basePath}/${worktreePath}`,
                branchName: name,
                error: undefined
            };
        }

        if (!result.stderr.includes('already exists')) {
            break;
        }
    }

    return {
        success: false,
        worktreePath: '',
        branchName: '',
        error: result?.stderr || 'Failed to create worktree'
    };
}

export interface WorktreeInfo {
    path: string;
    branch: string;
}

export async function listWorktrees(
    machineId: string,
    basePath: string
): Promise<WorktreeInfo[]> {
    const result = await machineBash(
        machineId,
        'git worktree list --porcelain',
        basePath
    );
    if (!result.success) return [];

    // Porcelain output has blocks separated by blank lines.
    // First block is the main worktree — skip it.
    const blocks = result.stdout.split('\n\n').slice(1);
    const worktrees: WorktreeInfo[] = [];

    for (const block of blocks) {
        let path = '';
        let branch = '';
        for (const line of block.split('\n')) {
            if (line.startsWith('worktree ')) {
                path = line.slice('worktree '.length);
            } else if (line.startsWith('branch refs/heads/')) {
                branch = line.slice('branch refs/heads/'.length);
            }
        }
        if (path) {
            worktrees.push({ path, branch: branch || path });
        }
    }

    return worktrees;
}

export async function removeWorktree(
    machineId: string,
    worktreePath: string
): Promise<{ success: boolean; error?: string }> {
    const idx = worktreePath.indexOf(WORKTREE_PATH_MARKER);
    if (idx === -1) {
        return { success: false, error: 'Not a worktree path' };
    }
    const basePath = worktreePath.slice(0, idx);

    const result = await machineBash(
        machineId,
        `git worktree remove ${worktreePath} --force`,
        basePath
    );
    return {
        success: result.success,
        error: result.success ? undefined : (result.stderr || 'Failed to remove worktree'),
    };
}

/** Check if a path is inside a worktree */
export function isWorktreePath(path: string): boolean {
    return path.includes(WORKTREE_PATH_MARKER);
}

/** Extract the main repository checkout path from a possibly-worktree path */
export function getRepoPath(path: string): string {
    const idx = path.indexOf(WORKTREE_PATH_MARKER);
    if (idx === -1) return path;
    return path.slice(0, idx);
}

/** Extract the worktree name from a worktree path, or null if not a worktree */
export function getWorktreeName(path: string): string | null {
    const idx = path.indexOf(WORKTREE_PATH_MARKER);
    if (idx === -1) return null;
    return path.slice(idx + WORKTREE_PATH_MARKER.length);
}
