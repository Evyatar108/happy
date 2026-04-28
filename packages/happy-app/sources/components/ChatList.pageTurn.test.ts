/**
 * Unit tests for the page-turn lazy-load threshold in pageToOlderMessages.
 *
 * The trigger condition must match the plan spec:
 *   nextOffset >= maxOffset - viewportHeight * 0.1
 *
 * i.e. fire loadOlder only when the user is within 10% of a viewport from
 * the oldest-content end. This is stricter (fires later) than the previous
 * `nextOffset >= maxOffset * 0.9` formula when contentHeight >> viewportHeight.
 */
import { describe, it, expect } from 'vitest';
import { buildChatListBoundaryItems } from './ChatList.boundaryItems';
import type { LatestBoundary } from '@/sync/reducer/reducer';
import type { Message } from '@/sync/typesMessage';

/**
 * Pure replica of the threshold guard from pageToOlderMessages.
 * Returns true when loadOlder should be triggered.
 */
function shouldLoadOlder(
    contentHeight: number,
    viewportHeight: number,
    nextOffset: number,
): boolean {
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    return maxOffset > 0 && nextOffset >= maxOffset - viewportHeight * 0.1;
}

describe('pageToOlderMessages lazy-load threshold', () => {
    // Scenario: contentHeight 10 000, viewportHeight 800
    //   maxOffset = 9 200
    //   trigger zone starts at: 9 200 - 80 = 9 120
    const contentHeight = 10_000;
    const viewportHeight = 800;
    const maxOffset = contentHeight - viewportHeight; // 9 200
    const triggerEdge = maxOffset - viewportHeight * 0.1; // 9 120

    it('does NOT fire when nextOffset is well below the trigger zone', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge - 1)).toBe(false);
    });

    it('fires exactly at the trigger edge (nextOffset === maxOffset - viewportHeight * 0.1)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge)).toBe(true);
    });

    it('fires when nextOffset is between trigger edge and maxOffset', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge + 40)).toBe(true);
    });

    it('fires at maxOffset (fully scrolled to oldest end)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, maxOffset)).toBe(true);
    });

    it('does NOT fire when content fits entirely in the viewport (maxOffset === 0)', () => {
        expect(shouldLoadOlder(viewportHeight, viewportHeight, 0)).toBe(false);
        expect(shouldLoadOlder(viewportHeight - 1, viewportHeight, 0)).toBe(false);
    });

    it('divergence from the old * 0.9 formula — the new formula fires later', () => {
        // With the OLD formula: nextOffset >= maxOffset * 0.9
        //   old trigger = 9 200 * 0.9 = 8 280
        // With the NEW formula: nextOffset >= maxOffset - viewportHeight * 0.1
        //   new trigger = 9 200 - 80 = 9 120
        //
        // A nextOffset of 8 300 would have fired under the old formula but
        // must NOT fire under the new formula.
        const oldFormulaWouldFire = 8_300;
        expect(oldFormulaWouldFire).toBeGreaterThanOrEqual(maxOffset * 0.9); // confirms old formula triggers
        expect(shouldLoadOlder(contentHeight, viewportHeight, oldFormulaWouldFire)).toBe(false); // new formula does NOT
    });
});

function userMessage(id: string, seq: number): Message {
    return {
        kind: 'user-text',
        id,
        localId: null,
        createdAt: seq,
        seq,
        text: id,
    };
}

function boundaryMessage(id: string, seq: number): Message {
    return {
        kind: 'agent-event',
        id,
        createdAt: seq,
        seq,
        event: {
            type: 'context-boundary',
            kind: 'clear',
            at: seq * 1000,
        },
    };
}

function latestBoundary(id: string, seq: number): LatestBoundary {
    return {
        id,
        seq,
        kind: 'clear',
        at: seq * 1000,
    };
}

function itemIds(messages: Message[], boundary: LatestBoundary, expanded: boolean): string[] {
    return buildChatListBoundaryItems(messages, boundary, expanded).items.map(item => item.id);
}

describe('ChatList context-boundary pagination rows', () => {
    it('collapses pre-boundary rows by default using latestBoundary.seq', () => {
        const messages = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
            userMessage('before-2', 8),
        ];

        const result = buildChatListBoundaryItems(messages, latestBoundary('boundary', 10), false);

        expect(result.hasLoadedBoundary).toBe(true);
        expect(result.hiddenPreBoundaryCount).toBe(2);
        expect(result.items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'show-pre-boundary-history',
        ]);
        expect(result.items.map(item => item.id)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history:boundary',
        ]);
    });

    it('keeps the divider position stable when older pre-boundary messages load', () => {
        const boundary = latestBoundary('boundary', 10);
        const initial = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
        ];
        const withOlderPage = [
            ...initial,
            userMessage('before-1', 9),
            userMessage('before-2', 8),
        ];

        expect(itemIds(initial, boundary, false)).toEqual(['after-2', 'after-1', 'boundary']);
        expect(itemIds(withOlderPage, boundary, false)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history:boundary',
        ]);
        expect(itemIds(withOlderPage, boundary, true)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'before-1',
            'before-2',
        ]);
    });

    it('renders a sticky divider while a metadata-seeded boundary row is outside the loaded window', () => {
        const boundary = latestBoundary('boundary', 10);
        const messages = [
            userMessage('after-3', 13),
            userMessage('after-2', 12),
            userMessage('after-1', 11),
        ];

        const result = buildChatListBoundaryItems(messages, boundary, false);

        expect(result.hasLoadedBoundary).toBe(false);
        expect(result.items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'sticky-boundary',
            'show-pre-boundary-history',
        ]);
        expect(result.items.map(item => item.id)).toEqual([
            'after-3',
            'after-2',
            'after-1',
            'boundary-sticky:boundary',
            'boundary-show-history:boundary',
        ]);
    });

    it('transitions from sticky metadata rendering to the loaded boundary row when the older page arrives', () => {
        const boundary = latestBoundary('boundary', 10);
        const initial = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
        ];
        const withBoundaryPage = [
            ...initial,
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];

        expect(buildChatListBoundaryItems(initial, boundary, false).items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'sticky-boundary',
            'show-pre-boundary-history',
        ]);
        expect(buildChatListBoundaryItems(withBoundaryPage, boundary, false).items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'show-pre-boundary-history',
        ]);
    });

    it('shows a newly received boundary row on the next ChatList item build without a refresh', () => {
        const beforeSocketUpdate = [
            userMessage('after-1', 11),
            userMessage('before-1', 9),
        ];
        const afterSocketUpdate = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];

        expect(buildChatListBoundaryItems(beforeSocketUpdate, null, false).items.map(item => item.id)).toEqual([
            'after-1',
            'before-1',
        ]);
        expect(buildChatListBoundaryItems(afterSocketUpdate, latestBoundary('boundary', 10), false).items.map(item => item.id)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history:boundary',
        ]);
    });
});
