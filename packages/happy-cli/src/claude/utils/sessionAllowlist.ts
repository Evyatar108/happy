import type { AgentState } from "@/api/types";
import { getToolDescriptor } from "./getToolDescriptor";

export type SessionAllowlistPermissionResponse = {
    approved: boolean;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    mode?: string;
    allowTools?: string[];
};

export class SessionAllowlist {
    private allowedTools = new Set<string>();
    private allowedBashLiterals = new Set<string>();
    private allowedBashPrefixes = new Set<string>();
    private allowEdits = false;

    clear(): void {
        this.allowedTools.clear();
        this.allowedBashLiterals.clear();
        this.allowedBashPrefixes.clear();
        this.allowEdits = false;
    }

    applyPermissionResponse(response: SessionAllowlistPermissionResponse, toolName?: string, input?: unknown): void {
        if (response.decision === 'abort') {
            this.clear();
            return;
        }

        if (response.decision === 'denied') {
            return;
        }

        if (!response.approved) {
            return;
        }

        if (response.mode === 'acceptEdits') {
            this.allowEdits = true;
        }

        for (const tool of response.allowTools ?? []) {
            this.allowTool(tool);
        }

        if (response.decision === 'approved_for_session' && (!response.allowTools || response.allowTools.length === 0) && toolName) {
            this.allowTool(getToolIdentifier(toolName, input));
        }
    }

    rehydrateFromAgentState(agentState: AgentState | null | undefined): void {
        for (const completed of Object.values(agentState?.completedRequests ?? {})) {
            this.applyPermissionResponse({
                approved: completed.status === 'approved',
                decision: completed.decision,
                mode: completed.mode,
                allowTools: completed.allowTools,
            }, completed.tool, completed.arguments);
        }
    }

    isAllowed(toolName: string, input: unknown): boolean {
        if (toolName === 'Bash') {
            const command = (input as { command?: string } | null | undefined)?.command;
            if (!command) {
                return false;
            }
            if (this.allowedBashLiterals.has(command)) {
                return true;
            }
            for (const prefix of this.allowedBashPrefixes) {
                if (command.startsWith(prefix)) {
                    return true;
                }
            }
            return false;
        }

        if (this.allowedTools.has(toolName)) {
            return true;
        }

        return this.allowEdits && getToolDescriptor(toolName).edit;
    }

    private allowTool(permission: string): void {
        if (permission.startsWith('Bash(') || permission === 'Bash') {
            this.parseBashPermission(permission);
        } else {
            this.allowedTools.add(permission);
        }
    }

    private parseBashPermission(permission: string): void {
        if (permission === 'Bash') {
            return;
        }

        const match = permission.match(/^Bash\((.+?)\)$/);
        if (!match) {
            return;
        }

        const command = match[1];
        if (command.endsWith(':*')) {
            this.allowedBashPrefixes.add(command.slice(0, -2));
        } else {
            this.allowedBashLiterals.add(command);
        }
    }
}

function getToolIdentifier(toolName: string, input: unknown): string {
    if (toolName === 'Bash') {
        const command = (input as { command?: string } | null | undefined)?.command;
        if (command) {
            return `Bash(${command})`;
        }
    }
    return toolName;
}
