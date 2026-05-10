import type { Session } from './storageTypes';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

const WIRE_PERMISSION_MODES = new Set<PermissionModeKey>([
    'default',
    'acceptEdits',
    'bypassPermissions',
    'plan',
    'read-only',
    'safe-yolo',
    'yolo',
]);

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

function toWirePermissionMode(mode: string | null | undefined): PermissionModeKey | undefined {
    if (!mode || !WIRE_PERMISSION_MODES.has(mode)) {
        return undefined;
    }
    return mode;
}

export function resolveMessageModeMeta(
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'effortLevel' | 'metadata' | 'permissionModeUserChosen'>,
): { permissionMode?: PermissionModeKey; model: string | null; thinkingLevel?: string } {
    const sandboxEnabled = isSandboxEnabled(session.metadata);
    const wireFromUser = session.permissionModeUserChosen
        ? toWirePermissionMode(session.permissionMode)
        : undefined;
    const permissionMode = wireFromUser ?? (sandboxEnabled ? 'bypassPermissions' : undefined);

    const modelMode = session.modelMode || session.metadata?.currentModelCode || 'default';
    const model = modelMode !== 'default' ? modelMode : null;
    const thinkingLevel = session.effortLevel ?? session.metadata?.currentThoughtLevelCode;

    return {
        ...(permissionMode !== undefined && { permissionMode }),
        model,
        ...(thinkingLevel != null && { thinkingLevel }),
    };
}
