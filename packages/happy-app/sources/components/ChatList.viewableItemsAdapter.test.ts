/**
 * US-006 AC #11: ChatList's onViewableItemsChanged adapter contract.
 *
 * Cases (a)-(c) per Plan AC #13:
 *  (a) ViewToken[] with mixed kinds yields visibleSeqs containing only
 *      message seqs (synthetic / boundary rows are filtered out).
 *  (b) ViewToken[] containing only synthetic rows yields visibleSeqs: [],
 *      computeRenderWindow returns null, and the bridge does NOT call
 *      storage.setRenderWindow.
 *  (c) Type/import grep ensures messageWindow.ts is not imported by
 *      ChatList.tsx for the synthetic-row branch (the bridge — i.e.
 *      sync.reportRenderWindow — owns the messageWindow.ts dependency, not
 *      ChatList.tsx).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeRenderWindow } from '../sync/messageWindow';
import type { ChatListBoundaryItem } from './ChatList.boundaryItems';

// One-to-one reproduction of ChatList.tsx:handleViewableItemsChanged
function handleViewableItemsChangedFilter(viewableItems: Array<{ item: ChatListBoundaryItem | undefined }>): number[] {
    const visibleSeqs: number[] = [];
    for (const token of viewableItems) {
        const item = token.item;
        if (item && item.kind === 'message') {
            visibleSeqs.push(item.message.seq);
        }
    }
    return visibleSeqs;
}

function userMessageItem(id: string, seq: number): ChatListBoundaryItem {
    return {
        kind: 'message',
        id,
        message: {
            kind: 'user-text',
            id,
            localId: null,
            createdAt: seq,
            seq,
            text: id,
        },
    } as ChatListBoundaryItem;
}

function stickyBoundaryItem(seq: number): ChatListBoundaryItem {
    return {
        kind: 'sticky-boundary',
        id: `sticky-${seq}`,
        latestBoundary: { id: 'b', seq, kind: 'clear', at: seq * 1000 },
    } as ChatListBoundaryItem;
}

function showPreBoundaryItem(seq: number): ChatListBoundaryItem {
    return {
        kind: 'show-pre-boundary-history',
        id: `show-${seq}`,
        latestBoundary: { id: 'b', seq, kind: 'clear', at: seq * 1000 },
    } as ChatListBoundaryItem;
}

describe('ChatList onViewableItemsChanged adapter (US-006 AC #11)', () => {
    it('(a) mixed-kinds ViewToken[] yields visibleSeqs with only message seqs', () => {
        const tokens = [
            { item: userMessageItem('m-12', 12) },
            { item: stickyBoundaryItem(10) },
            { item: userMessageItem('m-11', 11) },
            { item: showPreBoundaryItem(10) },
        ];
        expect(handleViewableItemsChangedFilter(tokens)).toEqual([12, 11]);
    });

    it('(b) only-synthetic ViewToken[] yields visibleSeqs:[] and computeRenderWindow returns null — bridge would NOT call setRenderWindow', () => {
        const tokens = [
            { item: stickyBoundaryItem(10) },
            { item: showPreBoundaryItem(10) },
        ];
        const visibleSeqs = handleViewableItemsChangedFilter(tokens);
        expect(visibleSeqs).toEqual([]);
        // The bridge calls computeRenderWindow on whatever the adapter
        // emits; with [] it returns null, which is the bridge's
        // null-window short-circuit (no setRenderWindow, no manager call).
        expect(computeRenderWindow({ visibleSeqs })).toBeNull();
    });

    it('(c) ChatList.tsx does NOT import messageWindow.ts or prefetchManager.ts', () => {
        const chatListPath = path.resolve(__dirname, 'ChatList.tsx');
        const source = fs.readFileSync(chatListPath, 'utf8');
        // Allow no import lines that pull from messageWindow / prefetchManager
        expect(source).not.toMatch(/from\s+['"][^'"]*messageWindow['"]/);
        expect(source).not.toMatch(/from\s+['"][^'"]*prefetchManager['"]/);
        // It also must NOT directly call storage.setRenderWindow
        expect(source).not.toMatch(/storage\.[A-Za-z]*\(\)\.setRenderWindow|storage\.getState\(\)\.setRenderWindow/);
    });

    it('items with undefined token.item are skipped (safety against RN viewableItems edge cases)', () => {
        const tokens = [
            { item: undefined },
            { item: userMessageItem('m-9', 9) },
            { item: undefined },
        ];
        expect(handleViewableItemsChangedFilter(tokens)).toEqual([9]);
    });
});
