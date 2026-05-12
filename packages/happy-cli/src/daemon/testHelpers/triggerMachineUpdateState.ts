import { connectTestTunnelSocket } from './socket';

export type TriggerMachineUpdateStateResult =
    | { result: 'error' }
    | { result: 'version-mismatch'; version: number; daemonState: string }
    | { result: 'success'; version: number; daemonState: string };

export async function triggerMachineUpdateState(
    machineId: string,
    encryptedDaemonState: string,
    expectedVersion: number,
): Promise<TriggerMachineUpdateStateResult> {
    const socket = await connectTestTunnelSocket({
        clientType: 'machine-scoped',
        machineId,
    });

    try {
        return await socket.emitWithAck('machine-update-state', {
            machineId,
            daemonState: encryptedDaemonState,
            expectedVersion,
        });
    } finally {
        socket.close();
    }
}
