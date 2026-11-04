-- CreateTable
CREATE TABLE "AdminSubcategory" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSubcategory_category_idx" ON "AdminSubcategory"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSubcategory_category_subcategory_key" ON "AdminSubcategory"("category", "subcategory");
