export type SessionGroupDropPosition = 'before' | 'after';

export function makeSessionGroupKey(machineId: string, path: string): string {
    return `${machineId}::${path}`;
}

export function applyOrderToProjectEntries<T>(
    alphabeticalEntries: Array<[path: string, group: T]>,
    machineId: string,
    order: string[],
): typeof alphabeticalEntries {
    if (order.length === 0 || alphabeticalEntries.length <= 1) {
        return alphabeticalEntries;
    }

    const byKey = new Map<string, [path: string, group: T]>();
    for (const entry of alphabeticalEntries) {
        byKey.set(makeSessionGroupKey(machineId, entry[0]), entry);
    }

    const ordered: Array<[path: string, group: T]> = [];
    const usedKeys = new Set<string>();
    for (const key of order) {
        const entry = byKey.get(key);
        if (!entry || usedKeys.has(key)) {
            continue;
        }
        ordered.push(entry);
        usedKeys.add(key);
    }

    for (const entry of alphabeticalEntries) {
        const key = makeSessionGroupKey(machineId, entry[0]);
        if (!usedKeys.has(key)) {
            ordered.push(entry);
        }
    }

    return ordered;
}

export function moveSessionGroup(
    order: string[],
    allVisibleKeys: string[],
    fromKey: string,
    toKey: string,
    position: SessionGroupDropPosition,
): string[] {
    if (fromKey === toKey) {
        return order;
    }

    const nextOrder = [...order];
    const included = new Set(nextOrder);
    for (const key of allVisibleKeys) {
        if (!included.has(key)) {
            nextOrder.push(key);
            included.add(key);
        }
    }

    const withoutFrom = nextOrder.filter((key) => key !== fromKey);
    const toIndex = withoutFrom.indexOf(toKey);
    if (toIndex === -1) {
        withoutFrom.push(fromKey);
        return withoutFrom;
    }

    const insertIndex = position === 'before' ? toIndex : toIndex + 1;
    withoutFrom.splice(insertIndex, 0, fromKey);
    return withoutFrom;
}
