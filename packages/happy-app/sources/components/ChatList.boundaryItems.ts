import type { LatestBoundary } from '@/sync/reducer/reducer';
import type { Message } from '@/sync/typesMessage';

export type ChatListBoundaryItem =
    | { kind: 'message'; id: string; message: Message }
    | { kind: 'sticky-boundary'; id: string; latestBoundary: LatestBoundary }
    | { kind: 'show-pre-boundary-history'; id: string; latestBoundary: LatestBoundary };

export type ChatListBoundaryItemsResult = {
    items: ChatListBoundaryItem[];
    hasLoadedBoundary: boolean;
    hiddenPreBoundaryCount: number;
};

function isLoadedBoundaryMessage(message: Message, latestBoundary: LatestBoundary): boolean {
    return message.kind === 'agent-event'
        && message.event.type === 'context-boundary'
        && (message.id === latestBoundary.id || message.seq === latestBoundary.seq);
}

function toMessageItem(message: Message): ChatListBoundaryItem {
    return { kind: 'message', id: message.id, message };
}

function stickyBoundaryItem(latestBoundary: LatestBoundary): ChatListBoundaryItem {
    return {
        kind: 'sticky-boundary',
        id: `boundary-sticky:${latestBoundary.id}`,
        latestBoundary,
    };
}

function showHistoryItem(latestBoundary: LatestBoundary): ChatListBoundaryItem {
    return {
        kind: 'show-pre-boundary-history',
        id: `boundary-show-history:${latestBoundary.id}`,
        latestBoundary,
    };
}

export function getLatestBoundaryKey(latestBoundary: LatestBoundary | null | undefined): string | null {
    return latestBoundary ? `${latestBoundary.seq}:${latestBoundary.id}` : null;
}

export function buildChatListBoundaryItems(
    messages: Message[],
    latestBoundary: LatestBoundary | null | undefined,
    preBoundaryExpanded: boolean,
): ChatListBoundaryItemsResult {
    if (!latestBoundary) {
        return {
            items: messages.map(toMessageItem),
            hasLoadedBoundary: false,
            hiddenPreBoundaryCount: 0,
        };
    }

    const hasLoadedBoundary = messages.some(message => isLoadedBoundaryMessage(message, latestBoundary));
    const preBoundaryMessages = messages.filter(message => message.seq < latestBoundary.seq);
    const hiddenPreBoundaryCount = preBoundaryExpanded ? 0 : preBoundaryMessages.length;

    if (preBoundaryExpanded) {
        const items = messages.map(toMessageItem);

        if (!hasLoadedBoundary) {
            const insertionIndex = messages.findIndex(message => message.seq < latestBoundary.seq);
            items.splice(insertionIndex === -1 ? items.length : insertionIndex, 0, stickyBoundaryItem(latestBoundary));
        }

        return { items, hasLoadedBoundary, hiddenPreBoundaryCount };
    }

    const activeItems = messages
        .filter(message => message.seq >= latestBoundary.seq)
        .map(toMessageItem);

    if (!hasLoadedBoundary) {
        activeItems.push(stickyBoundaryItem(latestBoundary));
    }

    if (preBoundaryMessages.length > 0 || !hasLoadedBoundary) {
        activeItems.push(showHistoryItem(latestBoundary));
    }

    return { items: activeItems, hasLoadedBoundary, hiddenPreBoundaryCount };
}
