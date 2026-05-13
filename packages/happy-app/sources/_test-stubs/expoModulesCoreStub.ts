// Vitest stub for `expo-modules-core`. The real module assumes a React-Native
// runtime where `globalThis.expo` is populated with the Expo bridge; that
// global is absent in the node test runner, so accessing `globalThis.expo.EventEmitter`
// at module-evaluation time throws `Cannot read properties of undefined (reading 'EventEmitter')`.
//
// Specs never exercise real expo event-emitter / native-module bindings, so a
// minimal no-op surface is enough to let any expo-* package that imports this
// (expo-image-picker, expo-image-manipulator, expo-document-picker, expo-file-system, ...)
// load cleanly. Specs that need a specific behavior should `vi.mock` the higher-level
// hook (`@/hooks/useFileAttachment`, `@/hooks/useNewSessionAttachments`) directly.

import { vi } from 'vitest';

class StubEventEmitter {
    addListener = vi.fn(() => ({ remove: vi.fn() }));
    removeAllListeners = vi.fn();
    removeSubscription = vi.fn();
    emit = vi.fn();
}

export const EventEmitter = StubEventEmitter;
export const NativeModulesProxy = new Proxy({}, { get: () => vi.fn() });
export const requireNativeModule = vi.fn(() => new Proxy({}, { get: () => vi.fn() }));
export const requireOptionalNativeModule = vi.fn(() => null);
export const requireNativeViewManager = vi.fn(() => () => null);
export const requireNativeView = vi.fn(() => () => null);
export const Platform = { OS: 'web' };
export const CodedError = class extends Error {
    code: string;
    constructor(code: string, message?: string) {
        super(message);
        this.code = code;
    }
};
export const UnavailabilityError = class extends Error {
    code = 'ERR_UNAVAILABLE';
    constructor(moduleName: string, propertyName: string) {
        super(`${moduleName}.${propertyName} is not available`);
    }
};
export const Subscription = class {
    remove = vi.fn();
};
export const NativeModule = StubEventEmitter;
export const SharedObject = class {};
export const SharedRef = class {};

export default {
    EventEmitter: StubEventEmitter,
    NativeModulesProxy,
    requireNativeModule,
    requireOptionalNativeModule,
    Platform,
    CodedError,
    UnavailabilityError,
    Subscription,
    NativeModule,
    SharedObject,
    SharedRef,
};
