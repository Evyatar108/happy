import * as React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { allImages, colorPairs } from "./avatarBrutalistAssets";
import { resolveTopicBrutalistAvatar } from "@/utils/avatarTopic";

interface AvatarTopicBrutalistProps {
    id: string;
    summaryText?: string;
    metadataName?: string;
    summaryUpdatedAt?: number;
    flavor?: string | null;
    pinnedAvatarImageIndex?: number;
    pinnedAvatarColorIndex?: number;
    size?: number;
    square?: boolean;
    monochrome?: boolean;
}

export const AvatarTopicBrutalist = React.memo((props: AvatarTopicBrutalistProps) => {
    const {
        id,
        summaryText,
        metadataName,
        summaryUpdatedAt,
        flavor,
        pinnedAvatarImageIndex,
        pinnedAvatarColorIndex,
        size = 32,
        square = false,
        monochrome = false,
    } = props;

    const { imageIndex, colorIndex } = React.useMemo(() => resolveTopicBrutalistAvatar({
        id,
        summaryText,
        name: metadataName,
        flavor,
        pinned: pinnedAvatarImageIndex !== undefined && pinnedAvatarColorIndex !== undefined
            ? { imageIndex: pinnedAvatarImageIndex, colorIndex: pinnedAvatarColorIndex }
            : null,
    }), [
        id,
        summaryText,
        metadataName,
        summaryUpdatedAt,
        flavor,
        pinnedAvatarImageIndex,
        pinnedAvatarColorIndex,
    ]);

    const imageSource = allImages[imageIndex];
    const colorPair = colorPairs[colorIndex];
    const tintColor = monochrome ? '#999999' : colorPair.tint;
    const backgroundColor = monochrome ? '#F0F0F0' : colorPair.background;

    const dimension = size;
    const borderRadius = square ? 0 : size / 2;

    return (
        <View
            style={{
                width: dimension,
                height: dimension,
                borderRadius,
                backgroundColor,
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <Image
                source={imageSource}
                style={{
                    width: dimension * 0.8,
                    height: dimension * 0.8,
                    borderRadius
                }}
                tintColor={tintColor}
            />
        </View>
    );
});
