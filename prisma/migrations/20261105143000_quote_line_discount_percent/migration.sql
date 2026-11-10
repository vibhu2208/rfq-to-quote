-- Per-product discount % on quote lines (stacks with header Quote.discountPercent)
ALTER TABLE "QuoteLineItem" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0;
