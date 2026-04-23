import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseLocalSearchParams = vi.fn<() => { id: string }>();
const mockUseSession = vi.fn<(id: string) => { metadata?: { agents?: string[] } | null } | null>();

vi.mock('expo-router', () => ({
    useLocalSearchParams: mockUseLocalSearchParams,
}));

vi.mock('@/sync/storage', () => ({
    useSession: mockUseSession,
}));

vi.mock('@/components/Item', () => ({
    Item: 'Item',
}));

vi.mock('@/components/ItemGroup', () => ({
    ItemGroup: 'ItemGroup',
}));

vi.mock('@/components/ItemList', () => ({
    ItemList: 'ItemList',
}));

const { AgentsScreen, EMPTY_STATE_TITLE } = await import('./agents');

function findElementsByType(node: React.ReactNode, type: string): React.ReactElement[] {
    if (Array.isArray(node)) {
        return node.flatMap((child) => findElementsByType(child, type));
    }

    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
        return [];
    }

    const element = node;

    if (typeof element.type === 'function') {
        return findElementsByType(
            (element.type as (props: typeof element.props) => React.ReactNode)(element.props),
            type,
        );
    }

    const matches: React.ReactElement[] = element.type === type ? [element] : [];
    return [...matches, ...findElementsByType(element.props.children, type)];
}

describe('AgentsScreen', () => {
    beforeEach(() => {
        mockUseLocalSearchParams.mockReturnValue({ id: 'session-123' });
        mockUseSession.mockReset();
    });

    it('renders one row per agent using the route session metadata', () => {
        mockUseSession.mockReturnValue({
            metadata: {
                agents: ['default', 'explorer', 'worker'],
            },
        });

        const tree = AgentsScreen();
        const rows = findElementsByType(tree, 'Item');

        expect(mockUseSession).toHaveBeenCalledWith('session-123');
        expect(rows).toHaveLength(3);
        expect(rows[0]?.props).toMatchObject({
            title: 'default',
            showChevron: false,
        });
        expect(rows[1]?.props).toMatchObject({
            title: 'explorer',
            showChevron: false,
        });
        expect(rows[2]?.props).toMatchObject({
            title: 'worker',
            showChevron: false,
        });
    });

    it('renders the empty state when the session has no agents metadata', () => {
        mockUseSession.mockReturnValue({
            metadata: {},
        });

        const tree = AgentsScreen();
        const rows = findElementsByType(tree, 'Item');

        expect(rows).toHaveLength(1);
        expect(rows[0]?.props).toMatchObject({
            title: EMPTY_STATE_TITLE,
            showChevron: false,
        });
    });

    it('renders the empty state when the session agents list is empty', () => {
        mockUseSession.mockReturnValue({
            metadata: {
                agents: [],
            },
        });

        const tree = AgentsScreen();
        const rows = findElementsByType(tree, 'Item');

        expect(rows).toHaveLength(1);
        expect(rows[0]?.props).toMatchObject({
            title: EMPTY_STATE_TITLE,
            showChevron: false,
        });
    });
});
