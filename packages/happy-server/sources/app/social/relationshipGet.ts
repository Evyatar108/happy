import { Prisma, PrismaClient } from "@prisma/client";
import { RelationshipStatus } from "./type";

export async function relationshipGet(tx: Prisma.TransactionClient | PrismaClient, from: string, to: string): Promise<RelationshipStatus> {
    return RelationshipStatus.none;
}
