import * as daemonClient from '@/daemon/daemonClient';
import { readCredentials } from '@/persistence';
import { randomUUID } from 'node:crypto';

export type SendTestMessageResult = {
    seq: number;
    id: string;
};

export async function sendTestMessage(sessionId: string, content: unknown): Promise<SendTestMessageResult> {
    const credentials = await readCredentials();
    if (!credentials) {
        throw new Error('sendTestMessage: no credentials found');
    }

    const localId = randomUUID();
    const response = await daemonClient.tunnelFetch(
        `/v3/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: [{ content, localId }] }),
        },
    );

    if (!response.ok) {
        throw new Error(`sendTestMessage: POST failed with status ${response.status}`);
    }

    const data = await response.json() as { messages: Array<{ id: string; seq: number; localId: string | null }> };
    const delivered = data.messages.find((m) => m.localId === localId);
    if (!delivered) {
        throw new Error(`sendTestMessage: server did not return seq for localId ${localId}`);
    }

    return { seq: delivered.seq, id: delivered.id };
}
