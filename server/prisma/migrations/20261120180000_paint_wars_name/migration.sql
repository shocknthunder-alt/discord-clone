-- The draw-and-guess game is called "Paint Wars": rename the channels made by 20261120120000_draw_game
-- (only those still carrying the original name — a channel someone renamed keeps its name).
UPDATE "TextChannel" SET "name" = 'paint wars' WHERE "type" = 'draw' AND "name" = 'рисувай и познай';
