import { useMemo } from 'react'

import { parseTaskIdFilter } from '../utils/urlFilter'

export function useUrlFilter() {
    const search = typeof window === 'undefined' ? '' : window.location.search
    return useMemo(() => parseTaskIdFilter(search), [search])
}
