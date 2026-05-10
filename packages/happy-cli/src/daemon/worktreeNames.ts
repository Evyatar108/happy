import * as crypto from 'node:crypto';

export function generateWorktreeName(): string {
  return `ralph-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
