import { Context } from "@/context";
import { allocateUserSeq } from "@/storage/seq";
import { buildUpdateAccountUpdate, eventRouter } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

export async function usernameUpdate(ctx: Context, username: string): Promise<void> {
    const userId = ctx.uid;

    // Send account update to all user connections
    const updSeq = await allocateUserSeq(userId);
    const updatePayload = buildUpdateAccountUpdate(userId, { username: username }, updSeq, randomKeyNaked(12));
    eventRouter.emitUpdate({
        userId, payload: updatePayload,
        recipientFilter: { type: 'user-scoped-only' }
    });
}
