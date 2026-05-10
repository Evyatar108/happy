import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UserMessageSchema } from '@/api/types';

describe('runOpenClaw attachment ignore behavior', () => {
  it('accepts attachment-bearing user messages while keeping OpenClaw queueing text-only', () => {
    const parsed = UserMessageSchema.parse({
      role: 'user',
      content: {
        type: 'text',
        text: 'verbatim openclaw text',
        attachments: [{ type: 'image', ref: 'base64-image' }],
      },
    });
    const source = readFileSync(new URL('./runOpenClaw.ts', import.meta.url), 'utf8');

    expect(parsed.content.text).toBe('verbatim openclaw text');
    expect(source).toContain('if (!message.content.text) return;');
    expect(source).toContain('messageQueue.push(message.content.text, { thinkingLevel: currentThinkingLevel });');
    expect(source).not.toContain('message.content.attachments');
  });
});
