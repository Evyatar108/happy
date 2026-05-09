export const RelationshipStatus = {
    none: 'none',
    requested: 'requested',
    pending: 'pending',
    friend: 'friend',
    rejected: 'rejected'
} as const;

export type RelationshipStatus = typeof RelationshipStatus[keyof typeof RelationshipStatus];

export type UserProfile = {
    id: string;
    firstName: string;
    lastName: string | null;
    avatar: {
        path: string;
        url: string;
        width?: number;
        height?: number;
        thumbhash?: string;
    } | null;
    username: string;
    bio: string | null;
    status: RelationshipStatus;
}
