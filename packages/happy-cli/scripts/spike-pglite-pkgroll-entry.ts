import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { createPGlite } from "happy-server/pglite";

async function main(): Promise<void> {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "happy-pglite-spike-"));
    const pg = createPGlite(dataDir);

    try {
        const result = await pg.query<{ answer: number }>("SELECT 42 AS answer");
        const answer = result.rows[0]?.answer;
        if (answer !== 42) {
            throw new Error(`Unexpected PGlite result: ${JSON.stringify(result.rows)}`);
        }
        console.log(`PGlite pkgroll spike passed; answer=${answer}`);
    } finally {
        await pg.close();
        await rm(dataDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
