-- CreateTable
CREATE TABLE "SoundboardSound" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 100,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundboardSound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoundboardSound_serverId_idx" ON "SoundboardSound"("serverId");

-- AddForeignKey
ALTER TABLE "SoundboardSound" ADD CONSTRAINT "SoundboardSound_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
