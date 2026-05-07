/**
 * Integration tests for Codex app-server session lifecycle.
 *
 * Drives `codex app-server` via the CodexAppServerClient — exercises the
 * permission reject → turn_aborted flow and per-turn model changes that
 * were impossible with the legacy MCP tools.
 *
 * Requirements:
 *   - `codex` CLI installed and on PATH (>= 0.100)
 *   - OPENAI_API_KEY (or equivalent) configured
 *
 * Run:
 *   npx vitest run src/codex/codex.integration.test.ts
 */

import { afterAll, afterEach, describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { existsSync } from "node:fs";
import { CodexAppServerClient, type CodexAppServerTransport } from "./codexAppServerClient";
import {
    deleteDiscovery,
    discoveryFilePath,
    isPidAlive,
    readDiscoveryRecord,
} from "./codexAppServerDiscovery";
import type { ReviewDecision, EventMsg } from "./codexAppServerTypes";
import { getIntegrationEnv } from "@/testing/currentIntegrationEnv";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gpt-5.2-codex";
const testFileCwd = process.cwd();
const integrationEnv = getIntegrationEnv();

type PermissionPolicy = "approve" | "deny" | "cancel" | "hold";

function policyToDecision(policy: Exclude<PermissionPolicy, "hold">): ReviewDecision {
    switch (policy) {
        case "approve":
            return "approved";
        case "deny":
            return "denied";
        case "cancel":
            return "abort";
    }
}

async function isCodexAppServerAvailable(): Promise<boolean> {
    try {
        const version = execSync("codex --version", { encoding: "utf8" }).trim();
        const match = version.match(/codex-cli\s+(\d+\.\d+\.\d+)/);
        if (!match) return false;
        const [major, minor] = match[1].split(".").map(Number);
        return major > 0 || minor >= 100;
    } catch {
        return false;
    }
}

async function isWsAuthAvailable(): Promise<boolean> {
    try {
        const helpOutput = execSync("codex app-server --help", {
            encoding: "utf8",
            windowsHide: true,
            timeout: 3000,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return helpOutput.includes("--ws-auth");
    } catch {
        return false;
    }
}

const codexAppServerAvailable = await isCodexAppServerAvailable();
const wsAuthAvailable = codexAppServerAvailable ? await isWsAuthAvailable() : false;
if (codexAppServerAvailable && !wsAuthAvailable) {
    console.warn("[integration] ws cases skipped: installed codex lacks --ws-auth");
}

const transportCases: Array<{ transport: CodexAppServerTransport; clientTransport: CodexAppServerTransport }> = [
    ...(wsAuthAvailable ? [{ transport: "ws" as const, clientTransport: "ws" as const }] : []),
    { transport: "stdio", clientTransport: "stdio" },
];

// ── CodexDriver ──────────────────────────────────────────────────────────────

interface TurnResult {
    aborted: boolean;
    elapsed_ms: number;
}

interface CodexEvent {
    type: string;
    data: any;
}

/**
 * Thin wrapper around CodexAppServerClient for testing.
 * Tracks events, permissions, and provides a simple send/continue API.
 */
class CodexDriver {
    readonly client: CodexAppServerClient;
    private threadStarted = false;
    private heldApprovals: Array<(decision: ReviewDecision) => void> = [];

    events: CodexEvent[] = [];
    permissionPolicy: PermissionPolicy = "approve";
    permissionCount = 0;

    constructor(transport?: CodexAppServerTransport) {
        this.client = transport === undefined
            ? new CodexAppServerClient()
            : new CodexAppServerClient(undefined, { transport });

        this.client.setEventHandler((msg: EventMsg) => {
            this.events.push({ type: msg.type, data: msg });
        });

        this.client.setApprovalHandler(async () => {
            this.permissionCount++;
            if (this.permissionPolicy === "hold") {
                return new Promise<ReviewDecision>((resolve) => {
                    this.heldApprovals.push(resolve);
                });
            }
            return policyToDecision(this.permissionPolicy);
        });
    }

    resolveHeldApprovals(decision: ReviewDecision): void {
        for (const resolve of this.heldApprovals) {
            resolve(decision);
        }
        this.heldApprovals = [];
    }

    /**
     * Interrupt the active turn. Unblock held approvals and send
     * turn/interrupt concurrently — codex may be blocked on the approval
     * callback and unable to process the interrupt until we respond.
     */
    async interrupt(): Promise<void> {
        this.resolveHeldApprovals("abort");
        await this.client.abortTurnWithFallback({
            gracePeriodMs: 5_000,
            forceRestartOnTimeout: true,
        });
    }

    async connect(): Promise<void> {
        await this.client.connect();
    }

    async restartBackendAndResume(): Promise<void> {
        if (!this.threadStarted) {
            throw new Error("No active thread — call send() first");
        }

        const resumed = await this.client.reconnectAndResumeThread({ terminateAppServer: true, skipDiscovery: true });
        if (!resumed) {
            throw new Error("Expected reconnectAndResumeThread() to resume the existing thread");
        }
    }

    /** Start a new thread and send the first turn. */
    async send(
        prompt: string,
        opts?: {
            approvalPolicy?: string;
            sandbox?: string;
            cwd?: string;
            model?: string;
        }
    ): Promise<TurnResult> {
        if (!this.threadStarted) {
            await this.client.startThread({
                model: opts?.model ?? DEFAULT_MODEL,
                cwd: opts?.cwd,
                approvalPolicy: opts?.approvalPolicy as any,
                sandbox: opts?.sandbox as any,
            });
            this.threadStarted = true;
        }

        const start = Date.now();
        const result = await this.client.sendTurnAndWait(prompt, {
            model: opts?.model,
            approvalPolicy: opts?.approvalPolicy as any,
            sandbox: opts?.sandbox as any,
            cwd: opts?.cwd,
        });

        return {
            aborted: result.aborted,
            elapsed_ms: Date.now() - start,
        };
    }

    /** Continue an existing thread with a new turn. */
    async continue(
        prompt: string,
        opts?: { model?: string; timeout?: number; approvalPolicy?: string; sandbox?: string }
    ): Promise<TurnResult> {
        if (!this.threadStarted) {
            throw new Error("No active thread — call send() first");
        }

        const start = Date.now();
        const result = await this.client.sendTurnAndWait(prompt, {
            model: opts?.model,
            approvalPolicy: opts?.approvalPolicy as any,
            sandbox: opts?.sandbox as any,
        });

        return {
            aborted: result.aborted,
            elapsed_ms: Date.now() - start,
        };
    }

    getMessages(): string[] {
        return this.events
            .filter((e) => e.type === "agent_message")
            .map((e) => e.data?.message ?? "")
            .filter(Boolean);
    }

    hasEvent(type: string): boolean {
        return this.events.some((e) => e.type === type);
    }

    clearEvents(): void {
        this.events = [];
        this.permissionCount = 0;
    }

    async close(): Promise<void> {
        await this.client.disconnect({ terminateAppServer: true });
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!codexAppServerAvailable)(
    "Codex Integration (app-server)",
    { timeout: 180_000 },
    () => {
        let driver: CodexDriver | null = null;
        let originalCwd: string | null = null;

        const useProjectCwd = () => {
            originalCwd ??= testFileCwd;
            process.chdir(integrationEnv.projectPath);
        };

        const waitForDeadPid = async (pid: number) => {
            const deadline = Date.now() + 5_000;
            while (Date.now() < deadline) {
                if (!isPidAlive(pid)) return;
                await new Promise((r) => setTimeout(r, 100));
            }
            expect(isPidAlive(pid)).toBe(false);
        };

        afterEach(async () => {
            try {
                if (driver) {
                    await driver.close();
                    driver = null;
                }
            } finally {
                if (originalCwd) {
                    process.chdir(originalCwd);
                    originalCwd = null;
                }
            }
        });

        afterAll(() => {
            process.chdir(testFileCwd);
        });

        it.each(transportCases)("should complete turn gracefully after permission cancel over $transport", async ({ clientTransport }) => {
            useProjectCwd();
            driver = new CodexDriver(clientTransport);
            await driver.connect();

            driver.permissionPolicy = "cancel";
            const result = await driver.send(
                'create a file called /tmp/codex-cancel-test.txt with the text "hello"',
                { approvalPolicy: "on-request", sandbox: "read-only", cwd: integrationEnv.projectPath }
            );

            // Codex v2 (0.115+): approval cancel declines the action, model
            // handles it gracefully and completes the turn (not aborted).
            expect(result.elapsed_ms).toBeLessThan(30_000);
            expect(driver.permissionCount).toBeGreaterThan(0);
            expect(driver.hasEvent("task_complete")).toBe(true);
            expect(result.aborted).toBe(false);
        });

        it.each(transportCases)("should preserve context when continuing after cancel over $transport", async ({ clientTransport }) => {
            useProjectCwd();
            driver = new CodexDriver(clientTransport);
            await driver.connect();

            // Turn 1: establish context with a mundane phrase
            driver.permissionPolicy = "approve";
            await driver.send(
                'The project name we are working on is "blue-falcon-42". Confirm by repeating the project name. Do NOT use any tools or run any commands.',
                { approvalPolicy: "on-request", sandbox: "read-only", cwd: integrationEnv.projectPath }
            );
            expect(driver.getMessages().join(" ").toLowerCase()).toContain("blue-falcon-42");

            // Turn 2: permission cancel — model handles rejection gracefully,
            // turn completes normally (v2 cancel ≠ abort).
            driver.clearEvents();
            driver.permissionPolicy = "cancel";
            const r2 = await driver.continue(
                'Create a file called /tmp/codex-test-context.txt with the text "test". Use a shell command.',
                { approvalPolicy: "on-request", sandbox: "read-only" }
            );
            expect(driver.hasEvent("task_complete")).toBe(true);
            expect(r2.aborted).toBe(false);

            // Turn 3: Codex must remember the project name from turn 1
            driver.clearEvents();
            driver.permissionPolicy = "approve";
            await driver.continue(
                "What was the project name I mentioned earlier? Reply with just the name."
            );

            const text = driver.getMessages().join(" ").toLowerCase();
            expect(text).toContain("blue-falcon-42");
        });

        it.each(transportCases)("should abort turn via interruptTurn while permission is pending over $transport", async ({ clientTransport }) => {
            useProjectCwd();
            driver = new CodexDriver(clientTransport);
            await driver.connect();

            // Hold permissions — simulates user not responding to approval
            driver.permissionPolicy = "hold";

            const turnPromise = driver.send(
                'Create a file called /tmp/codex-interrupt-test.txt with the text "hello". Use a shell command.',
                { approvalPolicy: "on-request", sandbox: "read-only", cwd: integrationEnv.projectPath }
            );

            // Wait for a permission request to arrive
            const deadline = Date.now() + 30_000;
            while (driver.permissionCount === 0 && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 100));
            }
            expect(driver.permissionCount).toBeGreaterThan(0);

            // Simulate the web app abort button with force-restart fallback.
            const abortStart = Date.now();
            const abortResult = await driver.client.abortTurnWithFallback({
                forceRestartOnTimeout: true,
                gracePeriodMs: 200,
            });
            driver.resolveHeldApprovals("abort");

            const result = await turnPromise;
            expect(Date.now() - abortStart).toBeLessThan(30_000);
            expect(result.elapsed_ms).toBeLessThan(30_000);
            expect(abortResult.hadActiveTurn).toBe(true);
            expect(abortResult.aborted).toBe(true);

            driver.clearEvents();
            driver.permissionPolicy = "approve";
            const followUp = await driver.continue(
                "Reply with exactly: ready",
                { approvalPolicy: "on-request", sandbox: "read-only" }
            );
            expect(followUp.elapsed_ms).toBeLessThan(30_000);
        });

        it.each(transportCases)("should preserve context after backend reconnect and thread/resume over $transport", async ({ clientTransport }) => {
            useProjectCwd();
            deleteDiscovery(discoveryFilePath());
            expect(existsSync(discoveryFilePath())).toBe(false);

            driver = new CodexDriver(clientTransport);
            await driver.connect();

            if (clientTransport === "ws") {
                expect(readDiscoveryRecord(discoveryFilePath())).not.toBeNull();
            } else {
                expect(existsSync(discoveryFilePath())).toBe(false);
            }

            driver.permissionPolicy = "approve";
            await driver.send(
                'The project codename is "steady-orchid-19". Confirm by repeating the project codename. Do NOT use any tools or run any commands.',
                { approvalPolicy: "on-request", sandbox: "read-only", cwd: integrationEnv.projectPath }
            );
            expect(driver.getMessages().join(" ").toLowerCase()).toContain("steady-orchid-19");

            if (clientTransport === "ws") {
                const capturedThreadId = driver.client.threadId;
                const capturedRecord = readDiscoveryRecord(discoveryFilePath());
                expect(capturedThreadId).not.toBeNull();
                expect(capturedRecord).not.toBeNull();
                if (!capturedThreadId || !capturedRecord) {
                    throw new Error("Expected ws discovery record and thread id before preserve disconnect");
                }

                await driver.client.disconnect();
                expect(isPidAlive(capturedRecord.pid)).toBe(true);
                expect(existsSync(discoveryFilePath())).toBe(true);

                const freshClient = new CodexAppServerClient(undefined, { transport: "ws" });
                freshClient.setEventHandler((msg: EventMsg) => {
                    driver?.events.push({ type: msg.type, data: msg });
                });
                freshClient.setApprovalHandler(async () => "approved");

                try {
                    await freshClient.connect();
                    const afterConnectRecord = readDiscoveryRecord(discoveryFilePath());
                    expect(afterConnectRecord?.pid).toBe(capturedRecord.pid);
                    expect(afterConnectRecord?.port).toBe(capturedRecord.port);
                    expect(afterConnectRecord?.capabilityToken).toBe(capturedRecord.capabilityToken);

                    await freshClient.resumeThread({
                        threadId: capturedThreadId,
                        cwd: integrationEnv.projectPath,
                        approvalPolicy: "on-request",
                        sandbox: "read-only",
                    });
                    await freshClient.sendTurnAndWait(
                        "What was the project codename I mentioned earlier? Reply with just the codename.",
                        { approvalPolicy: "on-request", sandbox: "read-only" }
                    );

                    const text = driver.getMessages().join(" ").toLowerCase();
                    expect(text).toContain("steady-orchid-19");
                } finally {
                    await freshClient.disconnect({ terminateAppServer: true });
                }

                await driver.close();
                driver = null;
                await waitForDeadPid(capturedRecord.pid);
                expect(existsSync(discoveryFilePath())).toBe(false);
                return;
            }

            driver.clearEvents();
            await driver.restartBackendAndResume();

            driver.clearEvents();
            await driver.continue(
                "What was the project codename I mentioned earlier? Reply with just the codename."
            );

            const text = driver.getMessages().join(" ").toLowerCase();
            expect(text).toContain("steady-orchid-19");
        });

        it.each(transportCases)("should preserve context when continuing after interruptTurn abort over $transport", async ({ clientTransport }) => {
            useProjectCwd();
            driver = new CodexDriver(clientTransport);
            await driver.connect();

            // Turn 1: establish context with a mundane phrase
            driver.permissionPolicy = "approve";
            await driver.send(
                'The project codename is "golden-phoenix-77". Confirm by repeating the project codename. Do NOT use any tools or run any commands.',
                { approvalPolicy: "on-request", sandbox: "read-only", cwd: integrationEnv.projectPath }
            );
            expect(driver.getMessages().join(" ").toLowerCase()).toContain("golden-phoenix-77");

            // Turn 2: hold permission, then abort via interruptTurn
            driver.clearEvents();
            driver.permissionPolicy = "hold";

            const abortedTurn = driver.continue(
                'Create a file called /tmp/codex-interrupt-context.txt with the text "test". Use a shell command.',
                { approvalPolicy: "on-request", sandbox: "read-only" }
            );

            const deadline = Date.now() + 30_000;
            while (driver.permissionCount === 0 && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 100));
            }
            expect(driver.permissionCount).toBeGreaterThan(0);

            // Codex v2: cancel = decline, model may finish normally before
            // interrupt lands. The important thing is it doesn't hang.
            await driver.interrupt();
            const r2 = await abortedTurn;
            expect(r2.elapsed_ms).toBeLessThan(30_000);

            // Turn 3: context must be preserved — Codex should remember the project name
            driver.clearEvents();
            driver.permissionPolicy = "approve";
            await driver.continue(
                "What was the project codename I mentioned earlier? Reply with just the codename. Do NOT use any tools or run any commands."
            );

            const text = driver.getMessages().join(" ").toLowerCase();
            expect(text).toContain("golden-phoenix-77");
        });
    }
);
