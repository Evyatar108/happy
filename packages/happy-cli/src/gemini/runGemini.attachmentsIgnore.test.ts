import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UserMessageSchema } from '@/api/types';

describe('runGemini attachment ignore behavior', () => {
  it('accepts attachment-bearing user messages while keeping Gemini queueing text-only', () => {
    const parsed = UserMessageSchema.parse({
      role: 'user',
      content: {
        type: 'text',
        text: 'verbatim gemini text',
        attachments: [{ type: 'image', ref: 'base64-image', mimeType: 'image/jpeg' }],
      },
    });
    const source = readFileSync(new URL('./runGemini.ts', import.meta.url), 'utf8');

    expect(parsed.content.text).toBe('verbatim gemini text');
    expect(source).toContain('const originalUserMessage = message.content.text;');
    expect(source).toContain('messageQueue.push(fullPrompt, mode);');
    expect(source).not.toContain('message.content.attachments');
  });
});
