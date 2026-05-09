import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { createHappyServer } from "happy-server";
import { pickFreeLoopbackPort } from "../src/utils/pickFreeLoopbackPort";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "happy-server-spike-"));
const port = await pickFreeLoopbackPort();
const server = createHappyServer({
    dataDir,
    port,
    machineKey: "spike-machine-key",
});

if (!server.app || typeof server.start !== "function" || typeof server.stop !== "function") {
    throw new Error("createHappyServer did not return { app, start, stop }");
}

try {
    await server.start();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const body = await response.json() as { ok?: boolean };
    if (response.status !== 200 || body.ok !== true) {
        throw new Error(`Unexpected server response: ${response.status} ${JSON.stringify(body)}`);
    }
    console.log(`createHappyServer spike passed on 127.0.0.1:${port}`);
} finally {
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
}
