import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { SessionContextBoundaryKind } from '@slopus/happy-wire';

type BoundaryDividerProps = {
    kind: SessionContextBoundaryKind;
};

export function getBoundaryDividerLabel(kind: SessionContextBoundaryKind): string {
    switch (kind) {
        case 'clear':
            return t('chat.boundaryDivider.kind.clear');
        case 'compact':
            return t('chat.boundaryDivider.kind.compact');
        case 'autocompact':
            return t('chat.boundaryDivider.kind.autocompact');
        case 'plan-mode-enter':
            return t('chat.boundaryDivider.kind.planModeEnter');
        case 'plan-mode-exit':
            return t('chat.boundaryDivider.kind.planModeExit');
        case 'session-fork-resume':
            return t('chat.boundaryDivider.kind.sessionForkResume');
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

export function BoundaryDivider({ kind }: BoundaryDividerProps) {
    return (
        <View style={styles.container}>
            <View style={styles.accent} />
            <Text style={styles.label}>{getBoundaryDividerLabel(kind)}</Text>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'relative',
        overflow: 'hidden',
        marginHorizontal: 8,
        marginVertical: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        backgroundColor: theme.colors.surface,
    },
    accent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: theme.colors.text,
    },
    label: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
}));

export default React.memo(BoundaryDivider);
