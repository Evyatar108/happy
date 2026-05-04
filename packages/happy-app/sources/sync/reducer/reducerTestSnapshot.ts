import { createReducer } from './reducer';

export type ReducerMessageSnapshot = ReturnType<typeof createReducer>['messages'] extends Map<string, infer TValue>
    ? TValue
    : never;

export function stableSort<T>(values: T[]): T[] {
    return [...values].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
}

export function serializeReducerMessage(message: ReducerMessageSnapshot | null) {
    if (!message) {
        return null;
    }

    return {
        createdAt: message.createdAt,
        realID: message.realID,
        role: message.role,
        text: message.text,
        isThinking: message.isThinking ?? false,
        event: message.event,
        tool: message.tool
            ? {
                name: message.tool.name,
                state: message.tool.state,
                input: message.tool.input,
                createdAt: message.tool.createdAt,
                startedAt: message.tool.startedAt,
                completedAt: message.tool.completedAt,
                description: message.tool.description,
                result: message.tool.result ?? null,
                permission: message.tool.permission ?? null,
            }
            : null,
        meta: message.meta ?? null,
    };
}

export function snapshotReducerState(state: ReturnType<typeof createReducer>) {
    return {
        localIds: Array.from(state.localIds.keys()).sort(),
        messageIds: Array.from(state.messageIds.keys()).sort(),
        latestTodos: state.latestTodos
            ? {
                todos: state.latestTodos.todos,
                timestamp: state.latestTodos.timestamp,
            }
            : null,
        latestUsage: state.latestUsage
            ? {
                ...state.latestUsage,
            }
            : null,
        latestBoundary: state.latestBoundary ? { ...state.latestBoundary } : null,
        messages: stableSort(
            Array.from(state.messages.values()).map((message) => serializeReducerMessage(message))
        ),
        sidechains: stableSort(
            Array.from(state.sidechains.entries()).map(([sidechainId, messages]) => ({
                sidechainId,
                messages: stableSort(messages.map((message) => serializeReducerMessage(message))),
            }))
        ),
        toolLinks: Array.from(state.toolIdToMessageId.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, messageId]) => ({
                toolId,
                message: serializeReducerMessage(state.messages.get(messageId) ?? null),
            })),
        pendingToolResults: Array.from(state.pendingToolResults.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, result]) => ({
                toolId,
                result,
            })),
    };
}
