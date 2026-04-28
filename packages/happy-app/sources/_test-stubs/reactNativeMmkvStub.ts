// Minimal stub for `react-native-mmkv` used only by the Vitest node runner.
// The real module requires a native module lookup that fails outside a RN
// runtime. Specs that transitively touch it (e.g. `sources/sync/serverConfig.ts`)
// don't need real persistence; an in-memory map is sufficient.

export class MMKV {
    private store: Map<string, string | number | boolean | ArrayBuffer>;

    constructor(opts?: { id?: string; path?: string; encryptionKey?: string }) {
        const storeId = opts?.id ?? 'default';
        const stores = getStores();
        const existing = stores.get(storeId);
        if (existing) {
            this.store = existing;
        } else {
            this.store = new Map<string, string | number | boolean | ArrayBuffer>();
            stores.set(storeId, this.store);
        }
    }

    getString(key: string): string | undefined {
        const v = this.store.get(key);
        return typeof v === 'string' ? v : undefined;
    }

    set(key: string, value: string | number | boolean | ArrayBuffer): void {
        this.store.set(key, value);
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clearAll(): void {
        this.store.clear();
    }

    contains(key: string): boolean {
        return this.store.has(key);
    }

    getAllKeys(): string[] {
        return Array.from(this.store.keys());
    }

    getBoolean(key: string): boolean | undefined {
        const v = this.store.get(key);
        return typeof v === 'boolean' ? v : undefined;
    }

    getNumber(key: string): number | undefined {
        const v = this.store.get(key);
        return typeof v === 'number' ? v : undefined;
    }

    getBuffer(key: string): ArrayBuffer | undefined {
        const v = this.store.get(key);
        return v instanceof ArrayBuffer ? v : undefined;
    }
}

function getStores(): Map<string, Map<string, string | number | boolean | ArrayBuffer>> {
    const globalRecord = globalThis as unknown as {
        __happyTestMmkvStores?: Map<string, Map<string, string | number | boolean | ArrayBuffer>>;
    };
    if (!globalRecord.__happyTestMmkvStores) {
        globalRecord.__happyTestMmkvStores = new Map();
    }
    return globalRecord.__happyTestMmkvStores;
}

export default { MMKV };
