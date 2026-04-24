// Minimal stub for `react-native` used only by the Vitest node runner.
// The real module contains Flow-typed syntax (`import typeof`) that Rollup's
// parser chokes on, so when vitest transforms any file whose import chain
// touches `react-native` (for example `sources/auth/tokenStorage.ts`), the
// suite fails to load.
//
// Tests that actually exercise React Native behaviour should mock the
// specific surface area they depend on; this stub simply keeps the module
// resolvable so unrelated specs (e.g. pure API/network tests) can run.

export const Platform = {
    OS: 'web' as 'web' | 'ios' | 'android' | 'macos' | 'windows',
    select: <T,>(specifics: Record<string, T | undefined> & { default?: T }): T | undefined =>
        specifics.web ?? specifics.default,
};

export const NativeModules: Record<string, unknown> = {};
export const DeviceEventEmitter = {
    addListener: () => ({ remove: () => {} }),
    removeAllListeners: () => {},
    emit: () => {},
};

export default {
    Platform,
    NativeModules,
    DeviceEventEmitter,
};
