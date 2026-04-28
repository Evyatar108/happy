import { describe, expect, it } from 'vitest';
import { formatDangerouslySkipPermissionsMetadata } from './sessionInfoPermissionMode';
import type { Session } from '@/sync/storageTypes';

const translate = (key: string) => key;

function createSession(overrides: Partial<Pick<Session, 'metadata' | 'permissionMode' | 'permissionModeUserChosen'>>): Pick<Session, 'metadata' | 'permissionMode' | 'permissionModeUserChosen'> {
    return {
        metadata: {
            path: '/workspace/project',
            host: 'devbox',
            flavor: 'claude',
        },
        permissionMode: 'default',
        permissionModeUserChosen: false,
        ...overrides,
    };
}

describe('formatDangerouslySkipPermissionsMetadata', () => {
    it('shows disabled after a user explicitly downgrades a legacy bypass session to default', () => {
        const session = createSession({
            permissionMode: 'default',
            permissionModeUserChosen: true,
            metadata: {
                path: '/workspace/project',
                host: 'devbox',
                flavor: 'claude',
                dangerouslySkipPermissions: true,
            },
        });

        expect(formatDangerouslySkipPermissionsMetadata(session, translate)).toBe('Disabled');
    });

    it('shows enabled after a user explicitly chooses bypass permissions', () => {
        const session = createSession({
            permissionMode: 'bypassPermissions',
            permissionModeUserChosen: true,
            metadata: {
                path: '/workspace/project',
                host: 'devbox',
                flavor: 'claude',
                dangerouslySkipPermissions: false,
            },
        });

        expect(formatDangerouslySkipPermissionsMetadata(session, translate)).toBe('Enabled');
    });
});
