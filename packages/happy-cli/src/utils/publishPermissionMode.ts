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

type AgentConfigurationMetadataPatch = {
    model?: string;
    thinkingLevel?: string;
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

/**
 * Publishes runner-side agent configuration (`model`, `thinkingLevel`) into
 * session metadata.
 *
 * The optimistic in-place mutation of `metadata` BEFORE awaiting
 * `client.updateMetadata(...)` is intentional and follows the same
 * offline-reconnect mutation contract documented in
 * `packages/happy-cli/CLAUDE.md` for `publishPermissionModeIfChanged`:
 * reconnect paths reuse the same metadata object by reference as the session
 * seed, so the runner-local copy must reflect the pending update while the
 * server round-trip is in flight. Do not reorder the mutation behind the
 * await without first revisiting that invariant.
 */
export async function publishAgentConfigurationMetadataIfChanged(
    client: MetadataPublisher,
    metadata: Metadata,
    patch: AgentConfigurationMetadataPatch,
): Promise<void> {
    const hasModel = Object.prototype.hasOwnProperty.call(patch, 'model');
    const hasThinkingLevel = Object.prototype.hasOwnProperty.call(patch, 'thinkingLevel');

    if (!hasModel && !hasThinkingLevel) {
        return;
    }

    if (
        (!hasModel || metadata.currentModelCode === patch.model)
        && (!hasThinkingLevel || metadata.currentThoughtLevelCode === patch.thinkingLevel)
    ) {
        return;
    }

    if (hasModel) {
        if (patch.model === undefined) {
            delete metadata.currentModelCode;
        } else {
            metadata.currentModelCode = patch.model;
        }
    }
    if (hasThinkingLevel) {
        if (patch.thinkingLevel === undefined) {
            delete metadata.currentThoughtLevelCode;
        } else {
            metadata.currentThoughtLevelCode = patch.thinkingLevel;
        }
    }

    try {
        await client.updateMetadata((currentMetadata) => ({
            ...currentMetadata,
            ...(hasModel ? { currentModelCode: patch.model } : {}),
            ...(hasThinkingLevel ? { currentThoughtLevelCode: patch.thinkingLevel } : {}),
        }));
    } catch (error) {
        logger.debug('[publishAgentConfigurationMetadata] Failed to update metadata:', error);
    }
}
