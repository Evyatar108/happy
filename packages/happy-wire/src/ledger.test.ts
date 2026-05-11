import { describe, expect, it } from 'vitest';

import { DoneLedgerRecordSchema, ErrorLedgerRecordSchema, LedgerRecordSchema } from './ledger';

const baseRecord = {
  runId: 'run-1',
  sessionId: 'session-1',
  timestamp: '2026-05-10T23:30:00.000Z',
};

describe('ledger schemas', () => {
  it.each([
    { eventType: 'spawn', agent: 'codex', projectPath: '/repo', worktreePath: '/repo/.dev/worktree/ralph-12345678' },
    { eventType: 'message-sent', direction: 'user-to-agent' },
    { eventType: 'idle-reached', queueDepth: 0 },
    { eventType: 'pending-permission', requestIds: ['request-1'] },
    { eventType: 'last-output-summary', summary: 'tests passed', heuristic: 'assistant-text' },
    { eventType: 'validation-attached', testReference: 'pnpm test', verificationUrl: 'https://example.com/verify' },
    { eventType: 'done', scopeSummary: 'implemented ledger', testReference: 'pnpm test', verificationUrl: 'https://example.com/verify', caveats: [] },
    { eventType: 'error', errorCode: 'spawn-failed', errorMessage: 'failed' },
  ] as const)('accepts $eventType records', (record) => {
    expect(LedgerRecordSchema.parse({ ...baseRecord, ...record }).eventType).toBe(record.eventType);
  });

  it.each(['scopeSummary', 'testReference', 'verificationUrl', 'caveats'] as const)(
    'rejects done records missing %s',
    (field) => {
      const record: Record<string, unknown> = {
        ...baseRecord,
        eventType: 'done',
        scopeSummary: 'implemented ledger',
        testReference: 'pnpm test',
        verificationUrl: 'https://example.com/verify',
        caveats: [],
      };
      delete record[field];

      expect(() => DoneLedgerRecordSchema.parse(record)).toThrow();
    },
  );

  it('validates error records with enum errorCode and message', () => {
    expect(ErrorLedgerRecordSchema.parse({
      ...baseRecord,
      eventType: 'error',
      errorCode: 'spawn-failed',
      errorMessage: 'git worktree add failed',
    })).toMatchObject({ errorCode: 'spawn-failed' });

    expect(() => ErrorLedgerRecordSchema.parse({
      ...baseRecord,
      eventType: 'error',
      errorCode: 'not-an-error-code',
      errorMessage: 'git worktree add failed',
    })).toThrow();
  });
});
