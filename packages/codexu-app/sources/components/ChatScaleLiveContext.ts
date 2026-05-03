import * as React from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type ChatScaleLiveValue = {
    liveMultiplier: SharedValue<number>;
    isActive: SharedValue<boolean>;
};

export const ChatScaleLiveContext = React.createContext<ChatScaleLiveValue | null>(null);
