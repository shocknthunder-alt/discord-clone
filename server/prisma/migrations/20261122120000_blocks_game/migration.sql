-- CreateTable
CREATE TABLE "BlockScore" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "best" INTEGER NOT NULL DEFAULT 0,
    "bestLines" INTEGER NOT NULL DEFAULT 0,
    "bestLevel" INTEGER NOT NULL DEFAULT 1,
    "games" INTEGER NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockScore_serverId_userId_key" ON "BlockScore"("serverId", "userId");

-- AddForeignKey
ALTER TABLE "BlockScore" ADD CONSTRAINT "BlockScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing server a ready-made 🧱 Шметрис channel.
INSERT INTO "TextChannel" ("id", "name", "serverId", "position", "type", "createdAt")
SELECT
    'blk' || substr(md5(random()::text || s."id"), 1, 22),
    'шметрис',
    s."id",
    COALESCE((SELECT MAX(t."position") + 1 FROM "TextChannel" t WHERE t."serverId" = s."id"), 0),
    'blocks',
    CURRENT_TIMESTAMP
FROM "Server" s;
