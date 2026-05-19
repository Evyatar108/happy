import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CommandList } from '../../components/CommandList'
import { loadOverviewData, NO_RALPH_STATE } from '../testData'

const expandedControls = {
    expanded: {},
    isExpanded: () => false,
    setAllExpanded: () => undefined,
    setTaskExpanded: () => undefined,
}

describe('CommandList Ralph stage chip DOM wiring', () => {
    afterEach(() => cleanup())

    it('omits the stage chip for tasks absent from Ralph state', () => {
        const data = loadOverviewData()
        const untrackedTaskId = data.tasks?.[0]?.id ?? ''
        const { container } = render(<CommandList data={data} expandedControls={expandedControls} ralphState={NO_RALPH_STATE} />)

        expect(untrackedTaskId).not.toBe('')
        expect(container.querySelectorAll(`[data-task-id="${untrackedTaskId}"] .ralph-stage-chip`)).toHaveLength(0)
    })
})
