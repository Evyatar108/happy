import * as React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';

// Small centred floating action button used in the collapsed sidebar rail.
export const FABCompact = React.memo(({ onPress }: { onPress: () => void }) => {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    return (
        <View style={[styles.container, { bottom: safeArea.bottom + 16 }]}>
            <Pressable
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : styles.buttonDefault]}
                onPress={onPress}
                accessibilityLabel={t('newSession.title')}
            >
                <Ionicons name="add" size={28} color={theme.colors.fab.icon} />
            </Pressable>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    button: {
        width: 48,
        height: 48,
        borderRadius: 24,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 3.84,
        shadowOpacity: theme.colors.shadow.opacity,
        elevation: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDefault: {
        backgroundColor: theme.colors.fab.background,
    },
    buttonPressed: {
        backgroundColor: theme.colors.fab.backgroundPressed,
    },
}));
