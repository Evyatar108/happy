export interface SyncLockMetadata {
    pid: number
    process: string
    startedAt: string
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

