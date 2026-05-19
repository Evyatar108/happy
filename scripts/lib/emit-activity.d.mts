import type { ActivityEvent } from '../../tools/overview-viewer/src/types'

export interface AppendActivityOptions {
    activityPath: string
    activityBackupPath: string
    maxLines?: number
}

export function appendActivity(repoRoot: string, event: ActivityEvent, options: AppendActivityOptions): void

export function rotateActivity(activityPath: string, activityBackupPath: string): void
