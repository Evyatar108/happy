import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UserMessageSchema } from '@/api/types';

describe('runAcp attachment ignore behavior', () => {
  it('accepts attachment-bearing user messages while keeping ACP queueing text-only', () => {
    const parsed = UserMessageSchema.parse({
      role: 'user',
      content: {
        type: 'text',
        text: 'verbatim acp text',
        attachments: [{ type: 'image', ref: 'base64-image', mimeType: 'image/png' }],
      },
    });
    const source = readFileSync(new URL('./runAcp.ts', import.meta.url), 'utf8');

    expect(parsed.content.text).toBe('verbatim acp text');
    expect(source).toContain('if (!message.content.text) {');
    expect(source).toContain('messageQueue.push(message.content.text, {');
    expect(source).not.toContain('message.content.attachments');
  });
});
