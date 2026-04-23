import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';

const EMPTY_STATE_TITLE = 'No agents available for this session.';
const LOADING_TITLE = 'Loading agents…';

type AgentEntry = NonNullable<NonNullable<Session['metadata']>['agents']>[number];

export function AgentsScreenContent({ agents, isLoading }: { agents?: AgentEntry[]; isLoading?: boolean }) {
    const items = agents ?? [];

    return (
        <ItemList>
            <ItemGroup>
                {isLoading ? (
                    <Item title={LOADING_TITLE} loading showChevron={false} />
                ) : items.length > 0 ? (
                    items.map((agent, index) => (
                        <Item
                            key={`${agent}-${index}`}
                            title={agent}
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

export function AgentsScreen() {
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const session = useSession(sessionId!);
    const isLoading = !!session && session.metadata?.tools === undefined;

    return <AgentsScreenContent agents={session?.metadata?.agents} isLoading={isLoading} />;
}

export { EMPTY_STATE_TITLE, LOADING_TITLE };

export default React.memo(AgentsScreen);
