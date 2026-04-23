import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseLocalSearchParams = vi.fn<() => { id: string }>();
const mockUseSession = vi.fn<(id: string) => { metadata?: { plugins?: Array<{ name: string; path: string }> } | null } | null>();

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

const { PluginsScreen, truncatePluginPath, EMPTY_STATE_TITLE } = await import('./plugins');

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

describe('truncatePluginPath', () => {
    it('returns the last two path segments across Windows and Unix-style paths', () => {
        expect(truncatePluginPath('C:\\plugins\\foocache\\bar')).toBe('foocache/bar');
        expect(truncatePluginPath('/home/u/.claude/plugins/x/y')).toBe('x/y');
        expect(truncatePluginPath('vendor/acme-plugin/cache')).toBe('acme-plugin/cache');
    });
});

describe('PluginsScreen', () => {
    beforeEach(() => {
        mockUseLocalSearchParams.mockReturnValue({ id: 'session-123' });
        mockUseSession.mockReset();
    });

    it('renders one row per plugin using the route session metadata', () => {
        mockUseSession.mockReturnValue({
            metadata: {
                plugins: [
                    { name: 'alpha-plugin', path: '/home/u/.claude/plugins/acme/alpha-plugin' },
                    { name: 'beta-plugin', path: 'C:\\plugins\\vendor\\beta-plugin' },
                ],
            },
        });

        const tree = PluginsScreen();
        const rows = findElementsByType(tree, 'Item');

        expect(mockUseSession).toHaveBeenCalledWith('session-123');
        expect(rows).toHaveLength(2);
        expect(rows[0]?.props).toMatchObject({
            title: 'alpha-plugin',
            subtitle: 'acme/alpha-plugin',
            showChevron: false,
        });
        expect(rows[1]?.props).toMatchObject({
            title: 'beta-plugin',
            subtitle: 'vendor/beta-plugin',
            showChevron: false,
        });
    });

    it('renders the empty state when the session has no plugins metadata', () => {
        mockUseSession.mockReturnValue({
            metadata: {},
        });

        const tree = PluginsScreen();
        const rows = findElementsByType(tree, 'Item');

        expect(rows).toHaveLength(1);
        expect(rows[0]?.props).toMatchObject({
            title: EMPTY_STATE_TITLE,
            showChevron: false,
        });
    });
});
