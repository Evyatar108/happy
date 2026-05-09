import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import * as fs from "fs";
import * as path from "path";

let pgliteInstance: PGlite | null = null;
let dbConfig: DatabaseConfig = {};
let dbInstance: PrismaClient | null = null;

export interface DatabaseConfig {
    provider?: "postgres" | "pglite";
    pgliteDir?: string;
}

type WebAssemblyModuleCtor = new (bytes: Buffer) => WebAssembly.Module;

function getWebAssemblyModuleCtor(): WebAssemblyModuleCtor | null {
    const moduleCtor = (globalThis as { WebAssembly?: { Module?: unknown } }).WebAssembly?.Module;
    return typeof moduleCtor === "function"
        ? (moduleCtor as WebAssemblyModuleCtor)
        : null;
}

function findPGliteWasm(): { wasmModule: WebAssembly.Module; fsBundle: Blob } | null {
    const wasmModuleCtor = getWebAssemblyModuleCtor();
    if (!wasmModuleCtor) {
        return null;
    }
    const searchPaths = [
        process.cwd(),
        path.dirname(process.execPath),
    ];
    for (const dir of searchPaths) {
        const wasmPath = path.join(dir, "pglite.wasm");
        const dataPath = path.join(dir, "pglite.data");
        if (fs.existsSync(wasmPath) && fs.existsSync(dataPath)) {
            const wasmModule = new wasmModuleCtor(fs.readFileSync(wasmPath));
            const fsBundle = new Blob([fs.readFileSync(dataPath)]);
            return { wasmModule, fsBundle };
        }
    }
    return null;
}

export function configureDb(config: DatabaseConfig) {
    if (dbInstance) {
        throw new Error("Database has already been initialized");
    }
    dbConfig = { ...config };
}

function createClient(): PrismaClient {
    const provider = dbConfig.provider || process.env.DB_PROVIDER || "postgres";

    if (provider === "pglite") {
        const pgliteDir = dbConfig.pgliteDir || process.env.PGLITE_DIR || "./data/pglite";
        const wasmOpts = findPGliteWasm();
        if (wasmOpts) {
            pgliteInstance = new PGlite({ dataDir: pgliteDir, ...wasmOpts });
        } else {
            pgliteInstance = new PGlite(pgliteDir);
        }
        const adapter = new PrismaPGlite(pgliteInstance);
        return new PrismaClient({ adapter } as any);
    }

    return new PrismaClient();
}

function getDb(): PrismaClient {
    dbInstance ??= createClient();
    return dbInstance;
}

export const db = new Proxy({} as PrismaClient, {
    get(_target, property) {
        const instance = getDb();
        const value = Reflect.get(instance, property);
        return typeof value === "function" ? value.bind(instance) : value;
    },
});

export async function disconnectDb() {
    if (!dbInstance) {
        return;
    }
    await dbInstance.$disconnect();
    await pgliteInstance?.close();
    dbInstance = null;
    pgliteInstance = null;
}

export function getPGlite(): PGlite | null {
    return pgliteInstance;
}
