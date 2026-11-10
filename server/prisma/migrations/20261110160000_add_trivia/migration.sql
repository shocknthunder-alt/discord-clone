-- AlterTable
ALTER TABLE "TextChannel" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "TriviaScore" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TriviaScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriviaScore_serverId_userId_key" ON "TriviaScore"("serverId", "userId");

-- AddForeignKey
ALTER TABLE "TriviaScore" ADD CONSTRAINT "TriviaScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing server a ready-made trivia channel.
INSERT INTO "TextChannel" ("id", "name", "serverId", "position", "type", "createdAt")
SELECT
    'trv' || substr(md5(random()::text || s."id"), 1, 22),
    'trivia',
    s."id",
    COALESCE((SELECT MAX(t."position") + 1 FROM "TextChannel" t WHERE t."serverId" = s."id"), 0),
    'trivia',
    CURRENT_TIMESTAMP
FROM "Server" s;
