/**
 * Publishes the runner's effective permission mode to session metadata.
 *
 * The optimistic metadata mutation is intentional: reconnect code reuses the
 * same metadata object as its session seed while the server update is in flight.
 */

import type { Metadata } from '@/api/types';
import { logger } from '@/ui/logger';

type MetadataPublisher = {
    updateMetadata(handler: (metadata: Metadata) => Metadata): Promise<void>;
};

export type LastPublishedPermissionModeRef = {
    current: string | undefined;
};

export async function publishPermissionModeIfChanged(
    client: MetadataPublisher,
    metadata: Metadata,
    mode: string | undefined,
    lastRef: LastPublishedPermissionModeRef,
): Promise<void> {
    if (lastRef.current === mode) {
        return;
    }

    lastRef.current = mode;
    if (mode === undefined) {
        delete metadata.currentPermissionModeCode;
    } else {
        metadata.currentPermissionModeCode = mode;
    }

    try {
        await client.updateMetadata((currentMetadata) => ({
            ...currentMetadata,
            currentPermissionModeCode: mode,
        }));
    } catch (error) {
        logger.debug('[publishPermissionMode] Failed to update permission mode metadata:', error);
    }
}
