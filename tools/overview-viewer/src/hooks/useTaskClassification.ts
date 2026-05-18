import { useMemo } from 'react'

import type { OverviewTask } from '../types'
import { filterBucketForTask, orderBucketForTask } from '../utils/taskClassification'

export function useTaskClassification(task: OverviewTask) {
    return useMemo(
        () => ({
            filterBucket: filterBucketForTask(task),
            orderBucket: orderBucketForTask(task),
        }),
        [task],
    )
}
