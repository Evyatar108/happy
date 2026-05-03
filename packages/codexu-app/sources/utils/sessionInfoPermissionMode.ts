import { getAvailablePermissionModes, resolvePermissionModeForPicker } from '@/components/modelModeOptions';
import type { Session } from '@/sync/storageTypes';

type Translate = (key: any) => string;

export function formatDangerouslySkipPermissionsMetadata(
    session: Pick<Session, 'metadata' | 'permissionMode' | 'permissionModeUserChosen'>,
    translate: Translate,
): string {
    const metadata = session.metadata;
    const resolvedPermissionMode = resolvePermissionModeForPicker(
        getAvailablePermissionModes(metadata?.flavor, metadata, translate),
        {
            userChosen: session.permissionModeUserChosen,
            sessionPermissionMode: session.permissionMode,
            metadataCurrentPermissionModeCode: metadata?.currentPermissionModeCode,
            metadataDangerouslySkipPermissions: metadata?.dangerouslySkipPermissions,
            flavor: metadata?.flavor,
        },
    );

    if (resolvedPermissionMode) {
        return resolvedPermissionMode.key === 'bypassPermissions' || resolvedPermissionMode.key === 'yolo'
            ? 'Enabled'
            : 'Disabled';
    }

    if (typeof metadata?.dangerouslySkipPermissions === 'boolean') {
        return metadata.dangerouslySkipPermissions ? 'Enabled' : 'Disabled';
    }

    const sandbox = metadata?.sandbox;
    if (metadata?.flavor === 'claude' && sandbox && typeof sandbox === 'object') {
        const sandboxValue = sandbox as Record<string, unknown>;
        if (sandboxValue.enabled === true) {
            return 'Enabled';
        }
    }

    return 'Unknown';
}
