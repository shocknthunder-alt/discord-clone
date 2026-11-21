-- "Моят текст" (Settings → Чат): how a person's messages look — JSON {color,bold,italic,font}; NULL = normal.
ALTER TABLE "User" ADD COLUMN "textStyle" TEXT;
