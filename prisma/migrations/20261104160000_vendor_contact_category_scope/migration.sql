-- AlterTable
ALTER TABLE "VendorContact" ADD COLUMN "vendorCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "VendorContact_vendorCategoryId_idx" ON "VendorContact"("vendorCategoryId");

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorCategoryId_fkey" FOREIGN KEY ("vendorCategoryId") REFERENCES "VendorCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
