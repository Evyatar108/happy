import { describe, expect, it } from 'vitest';
import type { NormalizedMessage } from '../typesRaw';
import { parseMessageAsEvent } from './messageToEvent';

function planModeToolMessage(name: 'EnterPlanMode' | 'enter_plan_mode'): NormalizedMessage {
    return {
        id: `msg-${name}`,
        localId: null,
        createdAt: 1,
        seq: 1,
        role: 'agent',
        isSidechain: false,
        content: [
            {
                type: 'tool-call',
                id: `tool-${name}`,
                name,
                input: {},
                description: null,
                uuid: `uuid-${name}`,
                parentUUID: null,
            },
        ],
    };
}

describe('parseMessageAsEvent', () => {
    it('preserves legacy EnterPlanMode synthesis when no typed boundary is present', () => {
        expect(parseMessageAsEvent(planModeToolMessage('EnterPlanMode'))).toEqual({
            type: 'message',
            message: 'Entering plan mode',
        });
    });

    it('suppresses legacy EnterPlanMode synthesis when a typed boundary is present or recorded', () => {
        expect(parseMessageAsEvent(
            planModeToolMessage('enter_plan_mode'),
            { suppressPlanModeEnter: true },
        )).toBeNull();
    });
});
