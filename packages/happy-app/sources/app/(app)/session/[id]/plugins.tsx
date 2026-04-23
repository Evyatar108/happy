import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';

const EMPTY_STATE_TITLE = 'No plugins loaded for this session.';

type PluginEntry = NonNullable<NonNullable<Session['metadata']>['plugins']>[number];

export function PluginsScreenContent({ plugins }: { plugins?: PluginEntry[] }) {
    const items = plugins ?? [];

    return (
        <ItemList>
            <ItemGroup>
                {items.length > 0 ? (
                    items.map((plugin, index) => (
                        <Item
                            key={`${plugin.name}-${plugin.path}-${index}`}
                            title={plugin.name}
                            subtitle={plugin.path}
                            showChevron={false}
                        />
                    ))
                ) : (
                    <Item
                        title={EMPTY_STATE_TITLE}
                        showChevron={false}
                    />
                )}
            </ItemGroup>
        </ItemList>
    );
}

export function PluginsScreen() {
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const session = useSession(sessionId!);

    return <PluginsScreenContent plugins={session?.metadata?.plugins} />;
}

export { EMPTY_STATE_TITLE };

export default React.memo(PluginsScreen);
