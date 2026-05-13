-- Sprint E US-007: Drop legacy models. Schema reduces to {Session, SessionMessage, Machine, PushToken}.

-- Drop FK constraints referencing legacy tables / columns we are about to remove
ALTER TABLE "AccessKey" DROP CONSTRAINT IF EXISTS "AccessKey_accountId_machineId_fkey";
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_accountId_fkey";

-- Drop indexes that reference accountId on tables we are keeping
DROP INDEX IF EXISTS "Machine_accountId_id_key";
DROP INDEX IF EXISTS "Machine_accountId_idx";
DROP INDEX IF EXISTS "Session_accountId_updatedAt_idx";
DROP INDEX IF EXISTS "Session_accountId_tag_key";

-- Drop legacy tables (CASCADE handles any remaining FKs to them)
DROP TABLE IF EXISTS "AccessKey" CASCADE;
DROP TABLE IF EXISTS "AccountAuthRequest" CASCADE;
DROP TABLE IF EXISTS "AccountPushToken" CASCADE;
DROP TABLE IF EXISTS "Artifact" CASCADE;
DROP TABLE IF EXISTS "GithubOrganization" CASCADE;
DROP TABLE IF EXISTS "GithubUser" CASCADE;
DROP TABLE IF EXISTS "GlobalLock" CASCADE;
DROP TABLE IF EXISTS "RepeatKey" CASCADE;
DROP TABLE IF EXISTS "ServiceAccountToken" CASCADE;
DROP TABLE IF EXISTS "SimpleCache" CASCADE;
DROP TABLE IF EXISTS "TerminalAuthRequest" CASCADE;
DROP TABLE IF EXISTS "UploadedFile" CASCADE;
DROP TABLE IF EXISTS "UsageReport" CASCADE;
DROP TABLE IF EXISTS "UserFeedItem" CASCADE;
DROP TABLE IF EXISTS "UserKVStore" CASCADE;
DROP TABLE IF EXISTS "UserRelationship" CASCADE;
DROP TABLE IF EXISTS "VoiceConversation" CASCADE;
DROP TABLE IF EXISTS "Account" CASCADE;

-- Drop accountId columns from remaining tables
ALTER TABLE "Machine" DROP COLUMN IF EXISTS "accountId";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "accountId";

-- Add unique constraint on Session.tag per current schema
CREATE UNIQUE INDEX "Session_tag_key" ON "Session"("tag");

-- Add updatedAt-only index on Session per current schema
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt" DESC);

-- Create PushToken (new per-machine push token model)
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushToken_machineId_deviceId_key" ON "PushToken"("machineId", "deviceId");
CREATE INDEX "PushToken_machineId_idx" ON "PushToken"("machineId");
