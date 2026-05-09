-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_githubUserId_fkey";

-- DropForeignKey
ALTER TABLE "TerminalAuthRequest" DROP CONSTRAINT "TerminalAuthRequest_responseAccountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountAuthRequest" DROP CONSTRAINT "AccountAuthRequest_responseAccountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountPushToken" DROP CONSTRAINT "AccountPushToken_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_accountId_fkey";

-- DropForeignKey
ALTER TABLE "UsageReport" DROP CONSTRAINT "UsageReport_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Machine" DROP CONSTRAINT "Machine_accountId_fkey";

-- DropForeignKey
ALTER TABLE "UploadedFile" DROP CONSTRAINT "UploadedFile_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceAccountToken" DROP CONSTRAINT "ServiceAccountToken_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Artifact" DROP CONSTRAINT "Artifact_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccessKey" DROP CONSTRAINT "AccessKey_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccessKey" DROP CONSTRAINT "AccessKey_accountId_machineId_fkey";

-- DropForeignKey
ALTER TABLE "UserRelationship" DROP CONSTRAINT "UserRelationship_fromUserId_fkey";

-- DropForeignKey
ALTER TABLE "UserRelationship" DROP CONSTRAINT "UserRelationship_toUserId_fkey";

-- DropForeignKey
ALTER TABLE "UserFeedItem" DROP CONSTRAINT "UserFeedItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserKVStore" DROP CONSTRAINT "UserKVStore_accountId_fkey";

-- DropForeignKey
ALTER TABLE "VoiceConversation" DROP CONSTRAINT "VoiceConversation_accountId_fkey";

-- DropIndex
DROP INDEX "Session_accountId_updatedAt_idx";

-- DropIndex
DROP INDEX "Session_accountId_tag_key";

-- DropIndex
DROP INDEX "UsageReport_accountId_idx";

-- DropIndex
DROP INDEX "UsageReport_accountId_sessionId_key_key";

-- DropIndex
DROP INDEX "Machine_accountId_idx";

-- DropIndex
DROP INDEX "Machine_accountId_id_key";

-- DropIndex
DROP INDEX "UploadedFile_accountId_idx";

-- DropIndex
DROP INDEX "UploadedFile_accountId_path_key";

-- DropIndex
DROP INDEX "ServiceAccountToken_accountId_idx";

-- DropIndex
DROP INDEX "ServiceAccountToken_accountId_vendor_key";

-- DropIndex
DROP INDEX "Artifact_accountId_idx";

-- DropIndex
DROP INDEX "Artifact_accountId_updatedAt_idx";

-- DropIndex
DROP INDEX "AccessKey_accountId_idx";

-- DropIndex
DROP INDEX "AccessKey_accountId_machineId_sessionId_key";

-- DropIndex
DROP INDEX "UserFeedItem_userId_counter_idx";

-- DropIndex
DROP INDEX "UserFeedItem_userId_counter_key";

-- DropIndex
DROP INDEX "UserFeedItem_userId_repeatKey_key";

-- DropIndex
DROP INDEX "UserKVStore_accountId_idx";

-- DropIndex
DROP INDEX "UserKVStore_accountId_key_key";

-- DropIndex
DROP INDEX "VoiceConversation_accountId_createdAt_idx";

-- AlterTable
ALTER TABLE "TerminalAuthRequest" DROP COLUMN "responseAccountId";

-- AlterTable
ALTER TABLE "AccountAuthRequest" DROP COLUMN "responseAccountId";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "UsageReport" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "Machine" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "UploadedFile" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "ServiceAccountToken" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "Artifact" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "AccessKey" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "UserFeedItem" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "UserKVStore" DROP COLUMN "accountId";

-- AlterTable
ALTER TABLE "VoiceConversation" DROP COLUMN "accountId";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "AccountPushToken";

-- DropTable
DROP TABLE "GithubUser";

-- DropTable
DROP TABLE "UserRelationship";

-- DropEnum
DROP TYPE "RelationshipStatus";

-- CreateIndex
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tag_key" ON "Session"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "UsageReport_sessionId_key_key" ON "UsageReport"("sessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_path_key" ON "UploadedFile"("path");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAccountToken_vendor_key" ON "ServiceAccountToken"("vendor");

-- CreateIndex
CREATE INDEX "Artifact_updatedAt_idx" ON "Artifact"("updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_machineId_sessionId_key" ON "AccessKey"("machineId", "sessionId");

-- CreateIndex
CREATE INDEX "UserFeedItem_counter_idx" ON "UserFeedItem"("counter" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFeedItem_counter_key" ON "UserFeedItem"("counter");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeedItem_repeatKey_key" ON "UserFeedItem"("repeatKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserKVStore_key_key" ON "UserKVStore"("key");

-- CreateIndex
CREATE INDEX "VoiceConversation_createdAt_idx" ON "VoiceConversation"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AccessKey" ADD CONSTRAINT "AccessKey_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

