-- CreateTable
CREATE TABLE "DrawScore" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DrawScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawScore_serverId_userId_key" ON "DrawScore"("serverId", "userId");

-- AddForeignKey
ALTER TABLE "DrawScore" ADD CONSTRAINT "DrawScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing server a ready-made 🎨 draw-and-guess channel.
INSERT INTO "TextChannel" ("id", "name", "serverId", "position", "type", "createdAt")
SELECT
    'drw' || substr(md5(random()::text || s."id"), 1, 22),
    'рисувай и познай',
    s."id",
    COALESCE((SELECT MAX(t."position") + 1 FROM "TextChannel" t WHERE t."serverId" = s."id"), 0),
    'draw',
    CURRENT_TIMESTAMP
FROM "Server" s;
