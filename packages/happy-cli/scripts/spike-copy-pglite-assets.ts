import { copyFile, mkdir } from "fs/promises";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const pgliteDist = path.dirname(require.resolve("@electric-sql/pglite"));
const targetDir = path.resolve(process.cwd(), process.argv[2] ?? "dist-spike");

await mkdir(targetDir, { recursive: true });
await Promise.all([
    copyFile(path.join(pgliteDist, "pglite.wasm"), path.join(targetDir, "pglite.wasm")),
    copyFile(path.join(pgliteDist, "pglite.data"), path.join(targetDir, "pglite.data")),
]);

console.log(`Copied PGlite assets to ${targetDir}`);
