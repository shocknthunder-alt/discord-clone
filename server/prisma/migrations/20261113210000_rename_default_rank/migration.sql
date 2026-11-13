-- The default rank is called "Пепега" (was "Член"); only renames it where nobody changed the name yet.
UPDATE "Role" SET "name" = 'Пепега' WHERE "isDefault" = true AND "name" = 'Член';
