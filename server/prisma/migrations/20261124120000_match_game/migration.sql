-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "best" INTEGER NOT NULL DEFAULT 0,
    "bestCombo" INTEGER NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_serverId_userId_mode_key" ON "MatchScore"("serverId", "userId", "mode");

-- AddForeignKey
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing server a ready-made 🍬 Шмиксер channel.
INSERT INTO "TextChannel" ("id", "name", "serverId", "position", "type", "createdAt")
SELECT
    'mtc' || substr(md5(random()::text || s."id"), 1, 22),
    'шмиксер',
    s."id",
    COALESCE((SELECT MAX(t."position") + 1 FROM "TextChannel" t WHERE t."serverId" = s."id"), 0),
    'match',
    CURRENT_TIMESTAMP
FROM "Server" s;
