export interface MachineSessionRef {
    machineId: string;
    localSessionId: string;
}

export function compositeSessionId(machineId: string, localSessionId: string): string {
    return `${machineId}:${localSessionId}`;
}

export function parseCompositeSessionId(sessionId: string, fallbackMachineId: string): MachineSessionRef {
    const separator = sessionId.indexOf(':');
    if (separator === -1) {
        return { machineId: fallbackMachineId, localSessionId: sessionId };
    }
    return {
        machineId: sessionId.slice(0, separator),
        localSessionId: sessionId.slice(separator + 1),
    };
}

export function localizeSessionPath(path: string, machineId: string): string {
    return path.replace(new RegExp(`/sessions/${machineId}:`, 'g'), '/sessions/');
}
