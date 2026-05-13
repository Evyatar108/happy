import { io, Socket } from 'socket.io-client';

export type SupportedAgent = 'claude' | 'codex' | 'gemini' | 'openclaw';

export type SpawnMachineSessionResult =
    | { type: 'success'; sessionId: string; worktreePath?: string; branchName?: string; runId?: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string };

type RpcAck = {
    ok: boolean;
    result?: unknown;
    error?: string;
};

type MachineRpcParams = {
    machineId: string;
    [key: string]: unknown;
};

function waitForConnect(socket: Socket, timeoutMs = 10_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (socket.connected) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
            reject(new Error('Timeout waiting for socket connection'));
        }, timeoutMs);

        const onConnect = () => {
            clearTimeout(timeout);
            socket.off('connect_error', onError);
            resolve();
        };

        const onError = (error: Error) => {
            clearTimeout(timeout);
            socket.off('connect', onConnect);
            reject(error);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
    });
}

function normalizeRpcError(error: string | undefined, machineId: string): string {
    if (!error) {
        return 'RPC call failed';
    }
    if (error === 'RPC method not available') {
        return `Machine ${machineId} is offline or its daemon is not connected.`;
    }
    return error;
}

async function callMachineRpc(
    tunnelUrl: string,
    tunnelClaim: string,
    connectToken: string,
    method: string,
    params: MachineRpcParams,
): Promise<SpawnMachineSessionResult> {
    const connectHeaders = { 'X-Tunnel-Connect': connectToken };
    const socket = io(tunnelUrl, {
        auth: {
            tunnelAuthorization: `tunnel ${tunnelClaim}`,
        },
        extraHeaders: connectHeaders,
        transportOptions: {
            websocket: { extraHeaders: connectHeaders },
            polling: { extraHeaders: connectHeaders },
        },
        path: '/v1/updates',
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false,
    });

    socket.connect();

    try {
        await waitForConnect(socket);

        const response = await socket.timeout(30_000).emitWithAck('rpc-call', {
            method: `${params.machineId}:${method}`,
            params,
        }) as RpcAck;

        if (!response.ok) {
            throw new Error(normalizeRpcError(response.error, params.machineId));
        }
        if (!response.result) {
            throw new Error('RPC call returned no result');
        }

        if (response.result == null || typeof response.result !== 'object' || Array.isArray(response.result)) {
            throw new Error('RPC call returned invalid data');
        }

        if (
            !('type' in response.result)
            || (
                response.result.type !== 'success'
                && response.result.type !== 'requestToApproveDirectoryCreation'
                && response.result.type !== 'error'
            )
        ) {
            throw new Error('RPC call returned unexpected data');
        }

        return response.result as SpawnMachineSessionResult;
    } finally {
        socket.close();
    }
}

export async function spawnSessionOnMachine(
    tunnelUrl: string,
    tunnelClaim: string,
    connectToken: string,
    params: {
        machineId: string;
        directory: string;
        approvedNewDirectoryCreation?: boolean;
        agent?: SupportedAgent;
        providerToken?: string;
    },
): Promise<SpawnMachineSessionResult> {
    return callMachineRpc(tunnelUrl, tunnelClaim, connectToken, 'spawn-happy-session', {
        machineId: params.machineId,
        type: 'spawn-in-directory',
        directory: params.directory,
        approvedNewDirectoryCreation: params.approvedNewDirectoryCreation ?? false,
        token: params.providerToken,
        agent: params.agent,
    });
}

export async function spawnInWorktreeOnMachine(
    tunnelUrl: string,
    tunnelClaim: string,
    connectToken: string,
    params: {
        machineId: string;
        repoPath: string;
        worktreePath?: string;
        runId?: string;
        agent: SupportedAgent;
        providerToken?: string;
    },
): Promise<SpawnMachineSessionResult> {
    return callMachineRpc(tunnelUrl, tunnelClaim, connectToken, 'spawn-in-worktree', {
        machineId: params.machineId,
        repoPath: params.repoPath,
        worktreePath: params.worktreePath,
        runId: params.runId,
        agent: params.agent,
        token: params.providerToken,
    });
}

export async function resumeSessionOnMachine(
    tunnelUrl: string,
    tunnelClaim: string,
    connectToken: string,
    params: {
        machineId: string;
        sessionId: string;
    },
): Promise<SpawnMachineSessionResult> {
    return callMachineRpc(tunnelUrl, tunnelClaim, connectToken, 'resume-happy-session', params);
}
