import type { EffortLevel } from '@/components/modelModeOptions';
import type { ModelMode, PermissionMode } from '@/components/PermissionModeSelector';

type AgentConfigurationUpdate = {
    sessionId: string;
    permissionMode?: string;
    model?: string;
    thinkingLevel?: string;
};

type ActiveAgentConfigurationDeps = {
    sessionId: string;
    emitAgentConfiguration: (config: AgentConfigurationUpdate) => Promise<unknown>;
};

export type ActiveAgentConfigurationSelection =
    | { kind: 'permissionMode'; option: PermissionMode }
    | { kind: 'model'; option: ModelMode }
    | { kind: 'effortLevel'; option: EffortLevel };

export function emitActiveAgentConfigurationSelection(
    { sessionId, emitAgentConfiguration }: ActiveAgentConfigurationDeps,
    selection: ActiveAgentConfigurationSelection,
) {
    switch (selection.kind) {
        case 'permissionMode':
            return emitAgentConfiguration({ sessionId, permissionMode: selection.option.key });
        case 'model':
            return emitAgentConfiguration({ sessionId, model: selection.option.key });
        case 'effortLevel':
            return emitAgentConfiguration({ sessionId, thinkingLevel: selection.option.key });
    }
}
