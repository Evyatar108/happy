// Minimal stub for `expo-constants` used only by the Vitest node runner.
// Importing the real module pulls in expo-modules-core which assumes a
// React-Native runtime. Specs that transitively touch it (e.g. anything
// reaching `sources/sync/apiSocket.ts`) don't need real values; returning
// sensible placeholders is enough.

const Constants = {
    expoConfig: {
        version: '0.0.0-test',
        extra: {} as Record<string, unknown>,
    },
    manifest: null,
    manifest2: null,
    sessionId: 'test-session',
    installationId: 'test-installation',
    statusBarHeight: 0,
    systemFonts: [] as string[],
    platform: { web: {} } as Record<string, unknown>,
    easConfig: null,
    deviceName: 'test-device',
    appOwnership: null,
};

export default Constants;
export const AppOwnership = { Expo: 'expo', Standalone: 'standalone', Guest: 'guest' };
export const ExecutionEnvironment = {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
};
