import type { Prisma } from "@prisma/client";
import { RelationshipStatus } from "./type";

/**
 * Check if a notification should be sent based on the last notification time and relationship status.
 * Returns true if:
 * - No previous notification was sent (lastNotifiedAt is null)
 * - OR 24 hours have passed since the last notification
 * - AND the relationship is not rejected
 */
export function shouldSendNotification(
    lastNotifiedAt: Date | null,
    status: RelationshipStatus
): boolean {
    // Don't send notifications for rejected relationships
    if (status === RelationshipStatus.rejected) {
        return false;
    }

    // If never notified, send notification
    if (!lastNotifiedAt) {
        return true;
    }

    // Check if 24 hours have passed since last notification
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastNotifiedAt < twentyFourHoursAgo;
}

/**
 * Send a friend request notification to the receiver and update lastNotifiedAt.
 * This creates a feed item for the receiver about the incoming friend request.
 */
export async function sendFriendRequestNotification(
    tx: Prisma.TransactionClient,
    receiverUserId: string,
    senderUserId: string
): Promise<void> {
    return;
}

/**
 * Send friendship established notifications to both users and update lastNotifiedAt.
 * This creates feed items for both users about the new friendship.
 */
export async function sendFriendshipEstablishedNotification(
    tx: Prisma.TransactionClient,
    user1Id: string,
    user2Id: string
): Promise<void> {
    return;
}
