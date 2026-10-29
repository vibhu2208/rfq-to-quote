CREATE TABLE IF NOT EXISTS "PartyContact" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PartyContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartyContact_partyId_isPrimary_idx" ON "PartyContact"("partyId", "isPrimary");

ALTER TABLE "PartyContact"
  DROP CONSTRAINT IF EXISTS "PartyContact_partyId_fkey";

ALTER TABLE "PartyContact"
  ADD CONSTRAINT "PartyContact_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PartyContact" ("id", "partyId", "name", "designation", "email", "phone", "isPrimary", "createdAt", "updatedAt")
SELECT
  'pc_' || "id",
  "id",
  COALESCE(NULLIF(BTRIM("managedByName"), ''), "legalName", 'Contact'),
  '',
  COALESCE("email", ''),
  COALESCE("phone", ''),
  true,
  NOW(),
  NOW()
FROM "Party"
WHERE NOT EXISTS (
  SELECT 1 FROM "PartyContact" c WHERE c."partyId" = "Party"."id"
)
AND (
  NULLIF(BTRIM(COALESCE("managedByName", '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE("email", '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE("phone", '')), '') IS NOT NULL
);
