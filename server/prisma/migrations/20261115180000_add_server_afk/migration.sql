-- AFK voice channel per server
ALTER TABLE "Server" ADD COLUMN "afkChannelId" TEXT;
ALTER TABLE "Server" ADD COLUMN "afkTimeoutMin" INTEGER NOT NULL DEFAULT 20;
