import { describe, expect, it } from 'vitest';

import { profileParse } from './profile';

describe('profileParse', () => {
    it('maps /v2/me/profile into the local profile shape', () => {
        expect(profileParse({
            githubUserId: 42,
            githubLogin: 'octocat',
            name: 'Octo Cat',
            avatarUrl: 'https://example.test/avatar.png',
            updatedAt: '2026-05-11T12:00:00.000Z',
        })).toMatchObject({
            id: '42',
            firstName: 'Octo',
            lastName: 'Cat',
            avatar: { url: 'https://example.test/avatar.png' },
            github: { login: 'octocat' },
            connectedServices: [],
        });
    });

    // profileParse passes the local shape through ProfileSchema.safeParse — it does not throw;
    // the old test description and assertion were incorrect before this correction.
    it('accepts the persisted local profile shape', () => {
        expect(profileParse({ id: '42', timestamp: 1, firstName: 'Old', lastName: null, avatar: null, github: null }))
            .toMatchObject({ id: '42', firstName: 'Old' });
    });
});
