export const DEFAULT_STALE_AFTER_MS: 60000

export interface SyncLockMetadata {
    pid: number
    process: string
    startedAt: string
}

export interface ParsedSyncLockMetadata {
    pid?: number
    process?: string
    startedAt?: string
}

export interface LockHandle {
    lockPath: string
    metadata: SyncLockMetadata
    release(): Promise<void>
    touch(): Promise<void>
}

export function acquireLock(options: {
    lockPath: string
    processLabel: string
    staleAfterMs?: number
}): Promise<LockHandle>

export function releaseLock(handle: LockHandle): Promise<void>

export function touchLock(handle: LockHandle): Promise<void>

export function parseLockMetadata(buffer: Buffer | string): ParsedSyncLockMetadata

export function isLockHolderAlive(pid: unknown): boolean

export type LockStatus =
    | { state: 'missing' }
    | { state: 'active'; pid: number; process: string; startedAt: string; mtime: Date }
    | { state: 'stale'; pid?: number; process?: string; startedAt?: string; mtime?: Date }

export function readLockStatus(
    lockPath: string,
    opts?: {
        staleAfterMs?: number
        retryDelayMs?: number
        now?: () => number
        isLockHolderAlive?: (pid: unknown) => boolean
    },
): Promise<LockStatus>
