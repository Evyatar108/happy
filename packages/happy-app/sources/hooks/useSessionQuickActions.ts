import * as React from 'react';
import type { SpawnSessionResult } from '@/sync/ops';
import { useHappyAction } from '@/hooks/useHappyAction';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { machineResumeSession, sessionArchive, sessionKill } from '@/sync/ops';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { storage, useLocalSetting, useMachine } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { HappyError } from '@/utils/errors';
import { copySessionMetadataToClipboard, copySessionMetadataAndLogsToClipboard } from '@/utils/copySessionMetadataToClipboard';
import { forkAvailability } from '@/utils/forkAvailability';
import { useSessionStatus } from '@/utils/sessionUtils';
import { getResumeAvailability } from '@/utils/resumeAvailability';
import { useRouter } from 'expo-router';
import { useSession } from '@/sync/storage';

export interface SessionActionItem {
    id: string;
    label: string;
    icon: string;
    onPress: () => void;
    destructive?: boolean;
}

interface UseSessionQuickActionsOptions {
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    onAfterCopySessionMetadata?: () => void;
}

export function useSessionQuickActions(
    session: Session,
    options: UseSessionQuickActionsOptions = {},
) {
    const {
        onAfterArchive,
        onAfterCopySessionMetadata,
    } = options;
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const sessionStatus = useSessionStatus(session);
    const machineId = session.metadata?.machineId ?? '';
    const machine = useMachine(machineId);
    const devModeEnabled = useLocalSetting('devModeEnabled');
    const resumeAvailability = React.useMemo(
        () => getResumeAvailability(session, machine, sessionStatus.isConnected),
        [machine, session, sessionStatus.isConnected],
    );
    const canFork = forkAvailability(session, machine);

    const openDetails = React.useCallback(() => {
        router.push(`/session/${session.id}/info`);
    }, [router, session.id]);

    const copySessionMetadata = React.useCallback(() => {
        void (async () => {
            const copied = await copySessionMetadataToClipboard(session);
            if (copied) {
                onAfterCopySessionMetadata?.();
            }
        })();
    }, [onAfterCopySessionMetadata, session]);

    const copySessionMetadataAndLogs = React.useCallback(() => {
        void (async () => {
            const copied = await copySessionMetadataAndLogsToClipboard(session);
            if (copied) {
                onAfterCopySessionMetadata?.();
            }
        })();
    }, [onAfterCopySessionMetadata, session]);

    const resumeSessionInline = React.useCallback(async (): Promise<SpawnSessionResult> => {
        if (!resumeAvailability.canResume) {
            return { type: 'error', errorMessage: resumeAvailability.message };
        }

        if (!machineId) {
            return { type: 'error', errorMessage: t('sessionInfo.resumeSessionMissingMachine') };
        }

        const result = await machineResumeSession({
            machineId,
            sessionId: session.id,
            model: session.modelMode ?? undefined,
            permissionMode: session.permissionMode ?? undefined,
        });

        switch (result.type) {
            case 'success': {
                await sync.refreshSessions();

                if (session.permissionMode) {
                    storage.getState().updateSessionPermissionMode(result.sessionId, session.permissionMode, session.permissionModeUserChosen);
                }
                if (session.modelMode) {
                    storage.getState().updateSessionModelMode(result.sessionId, session.modelMode);
                }

                navigateToSession(result.sessionId);
                return result;
            }
            case 'requestToApproveDirectoryCreation':
            case 'error':
                return result;
        }
    }, [machineId, navigateToSession, resumeAvailability.canResume, resumeAvailability.message, session.id, session.modelMode, session.permissionMode, session.permissionModeUserChosen]);

    const [resumingSession, performResume] = useHappyAction(async () => {
        const result = await resumeSessionInline();

        switch (result.type) {
            case 'success':
                return;
            case 'requestToApproveDirectoryCreation':
                throw new HappyError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'), false);
            case 'error':
                throw new HappyError(result.errorMessage, false);
        }
    });

    const [archivingSession, performArchive] = useHappyAction(async () => {
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId);

        // Try to kill the CLI process; if it's already dead, force-archive via server
        const killResult = await sessionKill(session.id);
        if (!killResult.success) {
            await sessionArchive(session.id);
        }
        onAfterArchive?.();
    });

    const archiveSession = React.useCallback(async () => {
        const confirmed = await Modal.confirm(
            t('sessionInfo.archiveSession'),
            t('sessionInfo.archiveSessionConfirm'),
            {
                cancelText: t('common.cancel'),
                confirmText: t('common.archive'),
                destructive: true,
            },
        );

        if (confirmed) {
            performArchive();
        }
    }, [performArchive]);

    const resumeSession = React.useCallback(() => {
        performResume();
    }, [performResume]);

    const forkSession = React.useCallback(() => {
        router.push(`/session/${session.id}/fork-composer`);
    }, [router, session.id]);

    const canCopySessionMetadata = __DEV__ || devModeEnabled;

    const actionItems = React.useMemo<SessionActionItem[]>(() => {
        const items: SessionActionItem[] = [
            { id: 'details', icon: 'information-circle-outline', label: t('profile.details'), onPress: openDetails },
        ];

        if (resumeAvailability.canShowResume) {
            items.push({ id: 'resume', icon: 'play-circle-outline', label: t('sessionInfo.resumeSession'), onPress: resumeSession });
        }

        if (canFork) {
            items.push({ id: 'fork', icon: 'git-branch-outline', label: t('drawer.fork.action'), onPress: forkSession });
        }

        if (canCopySessionMetadata) {
            items.push({ id: 'copy-metadata', icon: 'bug-outline', label: t('sessionInfo.copyMetadata'), onPress: copySessionMetadata });
            items.push({ id: 'copy-metadata-and-logs', icon: 'document-text-outline', label: t('sessionInfo.copyMetadata') + ' & Client Logs', onPress: copySessionMetadataAndLogs });
        }

        items.push({ id: 'archive', icon: 'archive-outline', label: t('sessionInfo.archiveSession'), onPress: archiveSession, destructive: true });

        return items;
    }, [
        archiveSession,
        canFork,
        canCopySessionMetadata,
        copySessionMetadata,
        copySessionMetadataAndLogs,
        forkSession,
        openDetails,
        resumeAvailability.canShowResume,
        resumeSession,
    ]);

    const showActionAlert = React.useCallback(() => {
        const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = actionItems.map(item => ({
            text: item.label,
            onPress: item.onPress,
            style: item.destructive ? 'destructive' as const : undefined,
        }));
        buttons.push({ text: t('common.cancel'), style: 'cancel' });
        Modal.alert('Session', undefined, buttons);
    }, [actionItems]);

    return {
        actionItems,
        showActionAlert,
        archiveSession,
        archivingSession,
        canArchive: true,
        canCopySessionMetadata,
        canFork,
        canResume: resumeAvailability.canResume,
        canShowResume: resumeAvailability.canShowResume,
        copySessionMetadata,
        copySessionMetadataAndLogs,
        forkSession,
        openDetails,
        resumeSession,
        resumeSessionInline,
        resumeAvailability,
        resumeSessionSubtitle: resumeAvailability.subtitle,
        resumingSession,
    };
}

/**
 * Lightweight hook for list items that only have a sessionId.
 * Returns a long-press handler that shows the action alert on mobile.
 */
export function useSessionActionAlert(sessionId: string) {
    const session = useSession(sessionId);
    const { showActionAlert } = useSessionQuickActions(session!, {});
    return session ? showActionAlert : undefined;
}
