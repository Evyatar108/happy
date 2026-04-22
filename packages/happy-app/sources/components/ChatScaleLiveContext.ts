import * as React from 'react';
import type { SharedValue } from 'react-native-reanimated';

export const ChatScaleLiveContext = React.createContext<SharedValue<number> | null>(null);
