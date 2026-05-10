import { allImages, colorPairs, hashCode } from '@/components/avatarBrutalistAssets';

export interface BrutalistAvatarTuple {
    imageIndex: number;
    colorIndex: number;
}

export interface TopicAvatarKeyInput {
    summaryText?: string | null;
    name?: string | null;
    flavor?: string | null;
}

export interface TopicBrutalistAvatarInput extends TopicAvatarKeyInput {
    id: string;
    pinned?: BrutalistAvatarTuple | null;
}

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is', 'it', 'its',
    'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'with', 'your', 'you',
]);

const TOKEN_PATTERN = /[\p{L}\p{N}]+|\p{Extended_Pictographic}/gu;

function djb2Hash(value: string): number {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash) + value.charCodeAt(i);
        hash = hash | 0;
    }
    return hash >>> 0;
}

export function resolveLegacyBrutalistAvatar(id: string): BrutalistAvatarTuple {
    return {
        imageIndex: hashCode(id) % allImages.length,
        colorIndex: hashCode(id + 'color') % colorPairs.length,
    };
}

export function buildTopicAvatarKey(input: TopicAvatarKeyInput): string | null {
    const source = [input.summaryText, input.name, input.flavor]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .normalize('NFKC')
        .toLowerCase();

    const tokens = Array.from(source.matchAll(TOKEN_PATTERN), ([token]) => token)
        .filter(token => !STOP_WORDS.has(token))
        .sort();

    return tokens.length > 0 ? tokens.join('|') : null;
}

export function resolveTopicBrutalistAvatar(input: TopicBrutalistAvatarInput): BrutalistAvatarTuple {
    if (input.pinned) {
        return input.pinned;
    }

    const topicKey = buildTopicAvatarKey(input);
    if (!topicKey) {
        return resolveLegacyBrutalistAvatar(input.id);
    }

    const hash = djb2Hash(topicKey);
    return {
        imageIndex: hash % allImages.length,
        // Use unsigned right shift so JavaScript sign propagation cannot create a negative color bucket.
        colorIndex: (hash >>> 16) % colorPairs.length,
    };
}
