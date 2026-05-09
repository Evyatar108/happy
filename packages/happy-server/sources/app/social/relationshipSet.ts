import { Prisma } from "@prisma/client";
import { RelationshipStatus } from "./type";

export async function relationshipSet(tx: Prisma.TransactionClient, from: string, to: string, status: RelationshipStatus, lastNotifiedAt?: Date) {
    return;
}
