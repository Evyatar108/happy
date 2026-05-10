import { describe, expect, it } from 'vitest';
import { getRawRecordLifecycleState } from './typesRaw';

// Helper builders for raw record shapes.
function agentAcpRecord(dataType: string) {
    return {
        role: 'agent',
        content: {
            type: 'acp',
            provider: 'codex',
            data: { type: dataType, id: 'test-id' },
        },
    };
}

function agentCodexRecord(dataType: string) {
    return {
        role: 'agent',
        content: {
            type: 'codex',
            data: { type: dataType },
        },
    };
}

describe('getRawRecordLifecycleState', () => {
    describe('acp content (new path)', () => {
        it('returns isTaskStarted=true for task_started', () => {
            expect(getRawRecordLifecycleState(agentAcpRecord('task_started'))).toEqual({
                isTaskStarted: true,
                isTaskComplete: false,
            });
        });

        it('returns isTaskComplete=true for task_complete', () => {
            expect(getRawRecordLifecycleState(agentAcpRecord('task_complete'))).toEqual({
                isTaskStarted: false,
                isTaskComplete: true,
            });
        });

        it('returns isTaskComplete=true for turn_aborted', () => {
            expect(getRawRecordLifecycleState(agentAcpRecord('turn_aborted'))).toEqual({
                isTaskStarted: false,
                isTaskComplete: true,
            });
        });
    });

    describe('codex content (legacy dual-path — explicit branch)', () => {
        it('returns isTaskStarted=true for legacy codex task_started', () => {
            // Legacy Codex lifecycle records carry task_started in content.data.type
            // but the codex schema discriminated union does not include that variant.
            // The explicit codex branch must delegate to getLegacyProviderLifecycleState
            // so thinking toggles correctly instead of silently returning false.
            expect(getRawRecordLifecycleState(agentCodexRecord('task_started'))).toEqual({
                isTaskStarted: true,
                isTaskComplete: false,
            });
        });

        it('returns isTaskComplete=true for legacy codex task_complete', () => {
            expect(getRawRecordLifecycleState(agentCodexRecord('task_complete'))).toEqual({
                isTaskStarted: false,
                isTaskComplete: true,
            });
        });

        it('returns isTaskComplete=true for legacy codex turn_aborted', () => {
            expect(getRawRecordLifecycleState(agentCodexRecord('turn_aborted'))).toEqual({
                isTaskStarted: false,
                isTaskComplete: true,
            });
        });

        it('returns false/false for a normal codex message type', () => {
            expect(getRawRecordLifecycleState(agentCodexRecord('message'))).toEqual({
                isTaskStarted: false,
                isTaskComplete: false,
            });
        });
    });

    describe('non-lifecycle records', () => {
        it('returns false/false for agent role with unrecognized content type', () => {
            expect(getRawRecordLifecycleState({ role: 'agent', content: { type: 'unknown', data: { type: 'task_started' } } })).toEqual({
                isTaskStarted: false,
                isTaskComplete: false,
            });
        });

        it('returns false/false for null input', () => {
            expect(getRawRecordLifecycleState(null)).toEqual({
                isTaskStarted: false,
                isTaskComplete: false,
            });
        });
    });
});
