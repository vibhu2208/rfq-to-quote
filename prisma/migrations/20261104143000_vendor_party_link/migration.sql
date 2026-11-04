-- Link Vendor rows to client-master Party (Is Vendor = Yes)
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "partyId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_partyId_key" ON "Vendor"("partyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Vendor_partyId_fkey'
  ) THEN
    ALTER TABLE "Vendor"
      ADD CONSTRAINT "Vendor_partyId_fkey"
      FOREIGN KEY ("partyId") REFERENCES "Party"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Party_isVendor_idx" ON "Party"("isVendor");
