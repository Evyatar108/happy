import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
    define: {
        // expo-modules-core, react-native, and other RN/Expo runtime packages
        // reference the global `__DEV__` flag that Metro injects in the app
        // bundle. Vitest's node runner never sees Metro, so we define it here
        // to avoid ReferenceErrors when module import chains pull these in.
        __DEV__: 'false',
    },
    test: {
        globals: false,
        environment: 'node',
        include: ['sources/**/*.{spec,test}.{ts,tsx}'],
        setupFiles: ['./sources/_test-stubs/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'dist/**',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData/**',
            ],
        },
    },
    resolve: {
        alias: [
            // Use array form so we can control matching order. The most
            // specific aliases must come first.
            {
                // The real react-native entry uses Flow syntax that Rollup can't
                // parse. Vitest runs in a node environment where we never exercise
                // the native bindings, so point it at a minimal stub. Specs that
                // need real behaviour should mock specific surfaces via `vi.mock`.
                find: /^react-native$/,
                replacement: resolve('./sources/_test-stubs/reactNativeStub.ts'),
            },
            {
                // expo-secure-store depends on expo-modules-core which assumes a
                // React-Native runtime. Specs that touch tokenStorage don't
                // exercise secure storage, so a no-op stub is enough.
                find: /^expo-secure-store$/,
                replacement: resolve('./sources/_test-stubs/expoSecureStoreStub.ts'),
            },
            {
                // Same reason as expo-secure-store: expo-constants pulls in
                // expo-modules-core which breaks outside a React-Native runtime.
                find: /^expo-constants$/,
                replacement: resolve('./sources/_test-stubs/expoConstantsStub.ts'),
            },
            {
                // react-native-mmkv requires a native module that is not
                // available in the Vitest node runner.
                find: /^react-native-mmkv$/,
                replacement: resolve('./sources/_test-stubs/reactNativeMmkvStub.ts'),
            },
            {
                // expo-modules-core reads `globalThis.expo.EventEmitter` at
                // module-evaluation time; that global is absent in the node
                // runner. Stub the surface so any expo-* package that imports
                // it (expo-image-picker, expo-image-manipulator, expo-document-picker,
                // expo-file-system, ...) loads cleanly. Specs that exercise real
                // expo behaviour mock the higher-level hook directly.
                find: /^expo-modules-core$/,
                replacement: resolve('./sources/_test-stubs/expoModulesCoreStub.ts'),
            },
            {
                find: /^@\//,
                replacement: resolve('./sources') + '/',
            },
        ],
    },
})
