// Minimal stub for `expo-secure-store` used only by the Vitest node runner.
// The real module depends on expo-modules-core internals that assume a
// React-Native/Metro runtime. The tests that transitively import this module
// (e.g. anything that reaches `sources/auth/tokenStorage.ts`) do not exercise
// the secure-store API, so a no-op stub is sufficient.

export async function getItemAsync(_key: string): Promise<string | null> {
    return null;
}

export async function setItemAsync(_key: string, _value: string): Promise<void> {
    // no-op
}

export async function deleteItemAsync(_key: string): Promise<void> {
    // no-op
}

export default {
    getItemAsync,
    setItemAsync,
    deleteItemAsync,
};
