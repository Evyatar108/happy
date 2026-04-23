import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';

const EMPTY_STATE_TITLE = 'No agents available for this session.';

type AgentEntry = NonNullable<NonNullable<Session['metadata']>['agents']>[number];

export function AgentsScreenContent({ agents }: { agents?: AgentEntry[] }) {
    const items = agents ?? [];

    return (
        <ItemList>
            <ItemGroup>
                {items.length > 0 ? (
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

    return <AgentsScreenContent agents={session?.metadata?.agents} />;
}

export { EMPTY_STATE_TITLE };

export default React.memo(AgentsScreen);
