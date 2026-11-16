-- 📌 pinned messages
ALTER TABLE "Message" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "pinnedById" TEXT;
CREATE INDEX "Message_textChannelId_pinnedAt_idx" ON "Message"("textChannelId", "pinnedAt");
