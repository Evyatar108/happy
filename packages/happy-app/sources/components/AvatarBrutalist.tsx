import * as React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { allImages, colorPairs, hashCode } from "./avatarBrutalistAssets";

interface AvatarBrutalistProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

export const AvatarBrutalist = React.memo((props: AvatarBrutalistProps) => {
    const { id, size = 32, square = false, monochrome = false } = props;

    const imageIndex = hashCode(id) % allImages.length;
    const colorIndex = hashCode(id + 'color') % colorPairs.length;

    const imageSource = allImages[imageIndex];
    const colorPair = colorPairs[colorIndex];
    const tintColor = monochrome ? '#999999' : colorPair.tint;
    const backgroundColor = monochrome ? '#F0F0F0' : colorPair.background;

    const dimension = square ? size : size;
    const borderRadius = square ? 0 : size / 2;

    return (
        <View
            style={{
                width: dimension,
                height: dimension,
                borderRadius,
                backgroundColor,
                // borderWidth: square ? 0 : 0.5,
                // borderColor: 'rgba(0, 0, 0, 0.1)',
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
