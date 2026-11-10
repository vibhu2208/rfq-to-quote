-- Department POCs should be removed with their VendorCategory mapping,
-- not orphaned as company-level contacts (previous ON DELETE SET NULL).
ALTER TABLE "VendorContact" DROP CONSTRAINT IF EXISTS "VendorContact_vendorCategoryId_fkey";

ALTER TABLE "VendorContact"
  ADD CONSTRAINT "VendorContact_vendorCategoryId_fkey"
  FOREIGN KEY ("vendorCategoryId") REFERENCES "VendorCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
