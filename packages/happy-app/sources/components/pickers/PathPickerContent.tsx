import React from 'react';
import {
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TextInputSelectionChangeEventData,
    View,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { pickerStyles } from './pickerStyles';
import type { PickerItem } from './PickerContent';

function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

function trimTrailingPathSeparator(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

function normalizePathForComparison(path: string | null | undefined, homeDir?: string): string | null {
    const trimmed = trimPathInput(path);
    if (!trimmed) {
        return null;
    }
    return trimTrailingPathSeparator(resolveAbsolutePath(trimmed, homeDir));
}

export function PathPickerContent({
    title,
    items,
    value,
    homeDir,
    onChangeValue,
    onDone,
}: {
    title: string;
    items: PickerItem[];
    value: string | null;
    homeDir?: string;
    onChangeValue: (value: string) => void;
    onDone?: () => void;
}) {
    const { theme } = useUnistyles();
    const inputRef = React.useRef<TextInput>(null);
    const currentValue = value ?? '';
    const [selection, setSelection] = React.useState<{ start: number; end: number } | undefined>(undefined);

    React.useEffect(() => {
        const timeout = setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
        return () => clearTimeout(timeout);
    }, []);

    const matchedItemKey = React.useMemo(() => {
        const normalizedValue = normalizePathForComparison(currentValue, homeDir);
        if (!normalizedValue) {
            return null;
        }

        const match = items.find((item) =>
            normalizePathForComparison(item.key, homeDir) === normalizedValue,
        );

        return match?.key ?? null;
    }, [currentValue, homeDir, items]);

    const handleSuggestionPress = React.useCallback((item: PickerItem) => {
        const nextValue = item.label;
        const nextSelection = { start: nextValue.length, end: nextValue.length };

        onChangeValue(nextValue);
        setSelection(nextSelection);

        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, [onChangeValue]);

    const isCustomPath = currentValue.trim().length > 0 && matchedItemKey === null;
    const handleSelectionChange = React.useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        setSelection(event.nativeEvent.selection);
    }, []);
    const doneIconColor = theme.colors.header.tint;

    return (
        <View style={pickerStyles.container}>
            <View style={pickerStyles.titleRow}>
                <Text style={[pickerStyles.title, { color: theme.colors.text }]}>{title}</Text>
                {Platform.OS !== 'web' && onDone && (
                    <Pressable
                        onPress={onDone}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                            pickerStyles.doneButtonPressable,
                            { opacity: pressed ? 0.82 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Done"
                    >
                        <GlassView
                            glassEffectStyle="regular"
                            tintColor="rgba(255,255,255,0.10)"
                            isInteractive={true}
                            style={[
                                pickerStyles.doneButtonGlass,
                                { borderColor: 'rgba(255,255,255,0.16)' },
                            ]}
                        >
                            <Ionicons
                                name="checkmark"
                                size={20}
                                color={doneIconColor}
                            />
                        </GlassView>
                    </Pressable>
                )}
            </View>

            <View
                style={[
                    pickerStyles.pathInputRow,
                    {
                        backgroundColor: theme.colors.input.background,
                        borderColor: theme.colors.divider,
                    },
                ]}
            >
                <Ionicons name="folder-outline" size={16} color={theme.colors.textSecondary} />
                <View style={pickerStyles.pathInputField}>
                    <TextInput
                        ref={inputRef}
                        value={currentValue}
                        onChangeText={onChangeValue}
                        onSelectionChange={handleSelectionChange}
                        selection={selection}
                        placeholder="Enter project path"
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[pickerStyles.pathTextInput, { color: theme.colors.text }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline={false}
                        numberOfLines={1}
                        returnKeyType="done"
                        onSubmitEditing={onDone}
                    />
                </View>
            </View>

            {isCustomPath && (
                <Text style={[pickerStyles.pathMetaText, { color: theme.colors.textSecondary }]}>using custom path above</Text>
            )}

            <Text style={[pickerStyles.sectionLabel, { color: theme.colors.textSecondary }]}>Recent</Text>

            <ScrollView style={pickerStyles.optionList} keyboardShouldPersistTaps="handled">
                {items.map((item) => {
                    const isSelected = item.key === matchedItemKey;

                    return (
                        <Pressable
                            key={item.key}
                            style={(p) => [pickerStyles.option, p.pressed && pickerStyles.optionPressed]}
                            onPress={() => handleSuggestionPress(item)}
                        >
                            <Ionicons
                                name="folder-outline"
                                size={16}
                                color={theme.colors.textSecondary}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={[pickerStyles.optionText, { color: theme.colors.text }]}>{item.label}</Text>
                            </View>
                            {isSelected && (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={18}
                                    color={theme.colors.button.primary.background}
                                />
                            )}
                        </Pressable>
                    );
                })}

                {items.length === 0 && (
                    <Text style={[pickerStyles.emptyText, { color: theme.colors.textSecondary }]}>no recent projects yet</Text>
                )}
            </ScrollView>
        </View>
    );
}
