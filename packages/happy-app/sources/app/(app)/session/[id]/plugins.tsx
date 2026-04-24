import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { t } from '@/text';

const EMPTY_STATE_TITLE = 'No plugins loaded for this session.';
const LOADING_TITLE = 'Loading plugins…';

type PluginEntry = NonNullable<NonNullable<Session['metadata']>['plugins']>[number];

function getPluginSubtitle(plugin: PluginEntry): string {
    return plugin.source ? `${plugin.path}\n${plugin.source}` : plugin.path;
}

export function PluginsScreenContent({ plugins, isLoading }: { plugins?: PluginEntry[]; isLoading?: boolean }) {
    const items = plugins ?? [];

    return (
        <ItemList>
            <ItemGroup>
                {isLoading ? (
                    <Item
                        title={LOADING_TITLE}
                        subtitle={t('session.catalogNotReadyBanner')}
                        loading
                        showChevron={false}
                    />
                ) : items.length > 0 ? (
                    items.map((plugin, index) => (
                        <Item
                            key={`${plugin.name}-${plugin.path}-${index}`}
                            title={plugin.name}
                            subtitle={getPluginSubtitle(plugin)}
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
    const isLoading = !!session && session.metadata?.tools === undefined;

    return <PluginsScreenContent plugins={session?.metadata?.plugins} isLoading={isLoading} />;
}

export { EMPTY_STATE_TITLE, LOADING_TITLE };

export default React.memo(PluginsScreen);
