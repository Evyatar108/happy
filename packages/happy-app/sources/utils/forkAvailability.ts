import type { Machine, Session } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';

export function forkAvailability(session: Session, machine: Machine | null | undefined): boolean {
    if (!machine || !isMachineOnline(machine)) {
        return false;
    }

    const resumeSupport = machine.metadata?.resumeSupport;
    return resumeSupport?.happyAgentAuthenticated === true
        && resumeSupport.forkRpcAvailable === true
        && session.metadata?.flavor === 'codex';
}
