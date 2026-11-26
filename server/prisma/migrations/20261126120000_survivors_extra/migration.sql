-- 🧟 Шмиркленд: skins, achievements and the kinds of bosses beaten ({"skins":[],"achievements":[],"bossTypes":[]}).
ALTER TABLE "SurvivorProfile" ADD COLUMN "extra" JSONB NOT NULL DEFAULT '{}';
