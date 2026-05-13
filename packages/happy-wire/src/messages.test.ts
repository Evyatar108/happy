import { describe, expect, it } from 'vitest';
import {
  ApiUpdateMachineStateSchema,
  ApiUpdateNewMessageSchema,
  ApiUpdateSessionStateSchema,
  CoreUpdateContainerSchema,
  MessageContentSchema,
  MessageMetaSchema,
  SessionMessageRangeRequestSchema,
  SessionMessageRangeResponseSchema,
  SessionProtocolMessageSchema,
} from './messages';
import {
  AgentMessageSchema,
  LegacyMessageContentSchema,
  UserMessageSchema,
} from './legacyProtocol';

describe('shared wire message schemas', () => {
  const encryptedMessage = {
    id: 'msg-1',
    seq: 10,
    localId: null,
    content: {
      t: 'encrypted',
      c: 'ZmFrZS1lbmNyeXB0ZWQ=',
    },
    createdAt: 123,
    updatedAt: 124,
  };

  it('parses a new-message update', () => {
    const parsed = ApiUpdateNewMessageSchema.safeParse({
      t: 'new-message',
      sid: 'session-1',
      message: encryptedMessage,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses update-session with nullable agentState value', () => {
    const parsed = ApiUpdateSessionStateSchema.safeParse({
      t: 'update-session',
      id: 'session-1',
      metadata: {
        version: 2,
        value: 'abc',
      },
      agentState: {
        version: 3,
        value: null,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses update-machine with optional activity fields', () => {
    const parsed = ApiUpdateMachineStateSchema.safeParse({
      t: 'update-machine',
      machineId: 'machine-1',
      metadata: {
        version: 1,
        value: 'abc',
      },
      daemonState: {
        version: 2,
        value: 'def',
      },
      active: true,
      activeAt: 12345,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses container updates for all shared update variants', () => {
    const examples = [
      {
        id: 'upd-1',
        seq: 1,
        body: {
          t: 'new-message',
          sid: 'session-1',
          message: {
            id: 'msg-1',
            seq: 1,
            localId: null,
            content: { t: 'encrypted', c: 'x' },
            createdAt: 1,
            updatedAt: 1,
          },
        },
        createdAt: 1,
      },
      {
        id: 'upd-2',
        seq: 2,
        body: {
          t: 'update-session',
          id: 'session-1',
          metadata: null,
          agentState: {
            version: 1,
            value: null,
          },
        },
        createdAt: 2,
      },
      {
        id: 'upd-3',
        seq: 3,
        body: {
          t: 'update-machine',
          machineId: 'machine-1',
          metadata: null,
          daemonState: null,
        },
        createdAt: 3,
      },
    ];

    for (const sample of examples) {
      expect(CoreUpdateContainerSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('parses legacy decrypted user message payload', () => {
    const parsed = UserMessageSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'fix this test',
      },
      meta: {
        sentFrom: 'mobile',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses legacy user message image attachments', () => {
    const parsed = UserMessageSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'describe this image',
        attachments: [
          { type: 'image', ref: 'data:image/png;base64,abc123', mimeType: 'image/png' },
        ],
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content.attachments).toEqual([
        { type: 'image', ref: 'data:image/png;base64,abc123', mimeType: 'image/png' },
      ]);
    }
  });

  it('parses legacy decrypted agent message payload', () => {
    const parsed = AgentMessageSchema.safeParse({
      role: 'agent',
      content: {
        type: 'output',
        data: {
          type: 'message',
          message: 'done',
        },
      },
      meta: {
        sentFrom: 'cli',
        contextBoundaryFallback: true,
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.meta?.contextBoundaryFallback).toBe(true);
    }
  });

  it('parses legacy message discriminated union', () => {
    const userParsed = LegacyMessageContentSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'hello',
      },
    });
    const agentParsed = LegacyMessageContentSchema.safeParse({
      role: 'agent',
      content: {
        type: 'event',
        data: { type: 'ready' },
      },
    });

    expect(userParsed.success).toBe(true);
    expect(agentParsed.success).toBe(true);
  });

  it('parses modern session protocol wrapper payload', () => {
    const parsed = SessionProtocolMessageSchema.safeParse({
      role: 'session',
      content: {
        id: 'msg-1',
        time: 1000,
        role: 'agent',
        turn: 'turn-1',
        ev: {
          t: 'text',
          text: 'hello',
        },
      },
      meta: {
        sentFrom: 'cli',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses top-level message discriminated union for legacy and modern roles', () => {
    const userParsed = MessageContentSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'hello from user',
      },
    });
    const agentParsed = MessageContentSchema.safeParse({
      role: 'agent',
      content: {
        type: 'output',
        data: {
          type: 'message',
          message: 'hello from agent',
        },
      },
    });
    const modernParsed = MessageContentSchema.safeParse({
      role: 'session',
      content: {
        id: 'msg-2',
        time: 2000,
        role: 'agent',
        turn: 'turn-2',
        ev: {
          t: 'text',
          text: 'hello from session protocol',
        },
      },
    });

    expect(userParsed.success).toBe(true);
    expect(agentParsed.success).toBe(true);
    expect(modernParsed.success).toBe(true);
  });

  it('parses session-message-range request and response fixtures', () => {
    const requestParsed = SessionMessageRangeRequestSchema.safeParse({
      requestId: 'request-1',
      sessionId: 'session-1',
      fromSeq: 20,
      toSeq: 99,
      limit: 80,
    });
    const successParsed = SessionMessageRangeResponseSchema.safeParse({
      ok: true,
      requestId: 'request-1',
      sessionId: 'session-1',
      fromSeq: 20,
      toSeq: 99,
      messages: [],
      hasMore: false,
    });

    expect(requestParsed.success).toBe(true);
    expect(successParsed.success).toBe(true);

    for (const code of ['session_not_found', 'invalid_range', 'rate_limited', 'internal']) {
      const errorParsed = SessionMessageRangeResponseSchema.safeParse({
        ok: false,
        requestId: 'request-1',
        error: {
          code,
          message: `${code} message`,
        },
      });

      expect(errorParsed.success).toBe(true);
    }
  });

  it('rejects invalid session-message-range requests', () => {
    const validRequest = {
      requestId: 'request-1',
      sessionId: 'session-1',
      fromSeq: 20,
      toSeq: 99,
      limit: 80,
    };
    const invalidRequests = [
      { ...validRequest, fromSeq: 1.5 },
      { ...validRequest, toSeq: 99.5 },
      { ...validRequest, limit: 80.25 },
      { ...validRequest, fromSeq: 100, toSeq: 99 },
      { ...validRequest, limit: 0 },
      { ...validRequest, limit: 201 },
      { sessionId: 'session-1', fromSeq: 20, toSeq: 99, limit: 80 },
      { requestId: 'request-1', fromSeq: 20, toSeq: 99, limit: 80 },
      { requestId: 'request-1', sessionId: 'session-1', toSeq: 99, limit: 80 },
      { requestId: 'request-1', sessionId: 'session-1', fromSeq: 20, limit: 80 },
      { requestId: 'request-1', sessionId: 'session-1', fromSeq: 20, toSeq: 99 },
    ];

    for (const request of invalidRequests) {
      expect(SessionMessageRangeRequestSchema.safeParse(request).success).toBe(false);
    }
  });

  it('rejects invalid session-message-range responses', () => {
    const validSuccess = {
      ok: true,
      requestId: 'request-1',
      sessionId: 'session-1',
      fromSeq: 20,
      toSeq: 99,
      messages: [encryptedMessage],
      hasMore: false,
    };
    const validError = {
      ok: false,
      requestId: 'request-1',
      error: {
        code: 'internal',
        message: 'failed',
      },
    };
    const invalidResponses = [
      { ...validSuccess, ok: undefined },
      { ...validSuccess, ok: 'true' },
      { ...validError, ok: undefined },
      { ...validError, ok: 'false' },
      { ...validError, error: { code: 'unauthorized', message: 'denied' } },
      { ok: true, sessionId: 'session-1', fromSeq: 20, toSeq: 99, messages: [], hasMore: false },
      { ok: true, requestId: 'request-1', fromSeq: 20, toSeq: 99, messages: [], hasMore: false },
      { ok: true, requestId: 'request-1', sessionId: 'session-1', toSeq: 99, messages: [], hasMore: false },
      { ok: true, requestId: 'request-1', sessionId: 'session-1', fromSeq: 20, messages: [], hasMore: false },
      { ok: true, requestId: 'request-1', sessionId: 'session-1', fromSeq: 20, toSeq: 99, hasMore: false },
      { ok: true, requestId: 'request-1', sessionId: 'session-1', fromSeq: 20, toSeq: 99, messages: [] },
      { ok: false, error: { code: 'internal', message: 'failed' } },
      { ok: false, requestId: 'request-1' },
      { ok: false, requestId: 'request-1', error: { code: 'internal' } },
    ];

    for (const response of invalidResponses) {
      expect(SessionMessageRangeResponseSchema.safeParse(response).success).toBe(false);
    }
  });

  it('preserves attachment refs in message metadata', () => {
    const meta = {
      attachmentRefs: [
        { remotePath: '.happy/attachments/local-1/file.txt', name: 'file.txt', size: 42 },
      ],
    };

    expect(MessageMetaSchema.parse(meta)).toEqual(meta);
  });
});
