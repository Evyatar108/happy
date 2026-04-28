import { describe, expect, it, vi } from 'vitest';

import type { Metadata } from '@/api/types';
import { publishPermissionModeIfChanged } from './publishPermissionMode';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createMetadata(): Metadata {
    return {
        path: '/workspace',
        host: 'test-host',
        homeDir: '/home/test',
        happyHomeDir: '/home/test/.happy',
        happyLibDir: '/home/test/.happy/lib',
        happyToolsDir: '/home/test/.happy/tools',
    };
}

function createClient(initialMetadata: Metadata = createMetadata()) {
    let serverMetadata = initialMetadata;
    const updateMetadata = vi.fn(async (handler: (metadata: Metadata) => Metadata) => {
        serverMetadata = handler(serverMetadata);
    });

    return {
        client: { updateMetadata },
        updateMetadata,
        getServerMetadata: () => serverMetadata,
    };
}

describe('publishPermissionModeIfChanged', () => {
    it('publishes only once for the same value twice sequentially', async () => {
        const metadata = createMetadata();
        const { client, updateMetadata, getServerMetadata } = createClient();
        const lastRef = { current: undefined };

        await publishPermissionModeIfChanged(client, metadata, 'default', lastRef);
        await publishPermissionModeIfChanged(client, metadata, 'default', lastRef);

        expect(updateMetadata).toHaveBeenCalledTimes(1);
        expect(metadata.currentPermissionModeCode).toBe('default');
        expect(getServerMetadata().currentPermissionModeCode).toBe('default');
        expect(lastRef.current).toBe('default');
    });

    it('publishes each genuine value change', async () => {
        const metadata = createMetadata();
        const { client, updateMetadata, getServerMetadata } = createClient();
        const lastRef = { current: undefined };

        await publishPermissionModeIfChanged(client, metadata, 'default', lastRef);
        await publishPermissionModeIfChanged(client, metadata, 'bypassPermissions', lastRef);

        expect(updateMetadata).toHaveBeenCalledTimes(2);
        expect(metadata.currentPermissionModeCode).toBe('bypassPermissions');
        expect(getServerMetadata().currentPermissionModeCode).toBe('bypassPermissions');
        expect(lastRef.current).toBe('bypassPermissions');
    });

    it('deduplicates concurrent same-mode publishes before the first update resolves', async () => {
        const metadata = createMetadata();
        let resolveUpdate: (() => void) | undefined;
        const updateMetadata = vi.fn((_handler: (metadata: Metadata) => Metadata) => new Promise<void>((resolve) => {
            resolveUpdate = resolve;
        }));
        const client = { updateMetadata };
        const lastRef = { current: undefined };

        const firstPublish = publishPermissionModeIfChanged(client, metadata, 'default', lastRef);
        const secondPublish = publishPermissionModeIfChanged(client, metadata, 'default', lastRef);

        expect(updateMetadata).toHaveBeenCalledTimes(1);
        expect(metadata.currentPermissionModeCode).toBe('default');
        expect(lastRef.current).toBe('default');

        resolveUpdate?.();
        await Promise.all([firstPublish, secondPublish]);
    });

    it('keeps optimistic writes and does not propagate updateMetadata rejection', async () => {
        const metadata = createMetadata();
        const updateMetadata = vi.fn(async () => {
            throw new Error('network down');
        });
        const client = { updateMetadata };
        const lastRef = { current: undefined };

        await expect(publishPermissionModeIfChanged(client, metadata, 'bypassPermissions', lastRef)).resolves.toBeUndefined();

        expect(updateMetadata).toHaveBeenCalledTimes(1);
        expect(metadata.currentPermissionModeCode).toBe('bypassPermissions');
        expect(lastRef.current).toBe('bypassPermissions');
    });
});
