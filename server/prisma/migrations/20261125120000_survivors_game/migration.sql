-- 🧟 Шмиркленд: each person's gold, shop upgrades, unlocked heroes and running stats.
-- (Top lists live in "MatchScore" with mode "surv" / "surv-coop": best = seconds, bestCombo = kills.)
CREATE TABLE "SurvivorProfile" (
    "userId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "upgrades" JSONB NOT NULL DEFAULT '{}',
    "heroes" JSONB NOT NULL DEFAULT '[]',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorProfile_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "SurvivorProfile" ADD CONSTRAINT "SurvivorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing server a ready-made 🧟 Шмиркленд channel.
INSERT INTO "TextChannel" ("id", "name", "serverId", "position", "type", "createdAt")
SELECT
    'svc' || substr(md5(random()::text || s."id"), 1, 22),
    'шмиркленд',
    s."id",
    COALESCE((SELECT MAX(t."position") + 1 FROM "TextChannel" t WHERE t."serverId" = s."id"), 0),
    'survivors',
    CURRENT_TIMESTAMP
FROM "Server" s;
