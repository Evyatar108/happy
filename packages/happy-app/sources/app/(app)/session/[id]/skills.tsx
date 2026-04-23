import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';

const EMPTY_STATE_TITLE = 'No skills loaded for this session.';
const LOADING_TITLE = 'Loading skills…';

type SkillEntry = NonNullable<NonNullable<Session['metadata']>['skills']>[number];

export function SkillsScreenContent({ skills, isLoading }: { skills?: SkillEntry[]; isLoading?: boolean }) {
    const items = skills ?? [];

    return (
        <ItemList>
            <ItemGroup>
                {isLoading ? (
                    <Item title={LOADING_TITLE} loading showChevron={false} />
                ) : items.length > 0 ? (
                    items.map((skill, index) => (
                        <Item
                            key={`${skill}-${index}`}
                            title={skill}
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

export function SkillsScreen() {
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const session = useSession(sessionId!);
    const isLoading = !!session && session.metadata?.tools === undefined;

    return <SkillsScreenContent skills={session?.metadata?.skills} isLoading={isLoading} />;
}

export { EMPTY_STATE_TITLE, LOADING_TITLE };

export default React.memo(SkillsScreen);
