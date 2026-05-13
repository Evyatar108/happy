import * as z from 'zod';

//
// Schema
//

export const GitHubProfileSchema = z.object({
    id: z.number(),
    login: z.string(),
    name: z.string(),
    avatar_url: z.string(),
    email: z.string().optional(),
    bio: z.string().nullable()
});

const V2ProfileSchema = z.object({
    githubUserId: z.number(),
    githubLogin: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    updatedAt: z.string(),
});

export const ImageRefSchema = z.object({
    width: z.number(),
    height: z.number(),
    thumbhash: z.string(),
    path: z.string(),
    url: z.string()
});

export const ProfileSchema = z.object({
    id: z.string(),
    timestamp: z.number(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: ImageRefSchema.nullable(),
    github: GitHubProfileSchema.nullable(),
    connectedServices: z.array(z.string()).default([])
});

export type GitHubProfile = z.infer<typeof GitHubProfileSchema>;
export type ImageRef = z.infer<typeof ImageRefSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

//
// Defaults
//

export const profileDefaults: Profile = {
    id: '',
    timestamp: 0,
    firstName: null,
    lastName: null,
    avatar: null,
    github: null,
    connectedServices: []
};
Object.freeze(profileDefaults);

//
// Parsing
//

export function profileParse(profile: unknown): Profile {
    // V2 server shape (response from /v2/me/profile).
    const v2 = V2ProfileSchema.safeParse(profile);
    if (v2.success) {
        const [firstName, ...rest] = (v2.data.name ?? '').trim().split(/\s+/).filter(Boolean);
        return {
            id: String(v2.data.githubUserId),
            timestamp: Date.parse(v2.data.updatedAt) || Date.now(),
            firstName: firstName ?? null,
            lastName: rest.length > 0 ? rest.join(' ') : null,
            avatar: v2.data.avatarUrl ? {
                width: 0,
                height: 0,
                thumbhash: '',
                path: v2.data.avatarUrl,
                url: v2.data.avatarUrl,
            } : null,
            github: {
                id: v2.data.githubUserId,
                login: v2.data.githubLogin,
                name: v2.data.name ?? '',
                avatar_url: v2.data.avatarUrl ?? '',
                bio: null,
            },
            connectedServices: [],
        };
    }
    // Local app shape (what saveProfile persists into MMKV) — pass through.
    const local = ProfileSchema.safeParse(profile);
    if (local.success) {
        return local.data;
    }
    throw new Error(`Failed to parse profile (neither V2 nor local shape): ${v2.error.message}`);
}

//
// Utility functions
//

export function getDisplayName(profile: Profile): string | null {
    if (profile.firstName || profile.lastName) {
        return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    }
    if (profile.github?.name) {
        return profile.github.name;
    }
    if (profile.github?.login) {
        return profile.github.login;
    }
    return null;
}

export function getAvatarUrl(profile: Profile): string | null {
    if (profile.avatar?.url) {
        return profile.avatar.url;
    }
    if (profile.github?.avatar_url) {
        return profile.github.avatar_url;
    }
    return null;
}

export function getBio(profile: Profile): string | null {
    return profile.github?.bio || null;
}
