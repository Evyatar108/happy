import { Ionicons, Octicons } from '@expo/vector-icons';
import * as React from 'react';
import { View, Text, Pressable, ViewStyle, TextStyle } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import type { FileAttachment } from '@/hooks/useFileAttachment';

export function formatAttachmentSize(size: number): string {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${Math.ceil(size / 1024)} KB`;
    }
    return `${Math.ceil(size / (1024 * 1024))} MB`;
}

export function buildMessageWithAttachmentRefs(text: string, attachmentRefs: { remotePath: string }[]): string {
    if (attachmentRefs.length === 0) {
        return text;
    }

    const attachmentBlock = [
        'Attachments:',
        ...attachmentRefs.map(ref => `- ${ref.remotePath}`),
    ].join('\n');

    const trimmedText = text.trim();
    return trimmedText ? `${trimmedText}\n\n${attachmentBlock}` : attachmentBlock;
}

export type AttachmentChipStyles = {
    chip: ViewStyle;
    chipText: TextStyle;
    chipSize: TextStyle;
    chipRemove: ViewStyle;
    chipRemovePressed?: ViewStyle;
};

export function AttachmentChip({
    attachment,
    onRemove,
    chipStyles,
}: {
    attachment: FileAttachment;
    onRemove: () => void;
    chipStyles: AttachmentChipStyles;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={chipStyles.chip} testID="attachment-chip">
            <Octicons name="paperclip" size={13} color={theme.colors.textSecondary} />
            <Text style={chipStyles.chipText} numberOfLines={1}>{attachment.name}</Text>
            <Text style={chipStyles.chipSize}>{formatAttachmentSize(attachment.size)}</Text>
            <Pressable
                accessibilityLabel={t('agentInput.attachments.removeButton', { name: attachment.name })}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                onPress={onRemove}
                style={({ pressed }) => [chipStyles.chipRemove, pressed ? chipStyles.chipRemovePressed : undefined]}
                testID="attachment-chip-remove"
            >
                <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
            </Pressable>
        </View>
    );
}
