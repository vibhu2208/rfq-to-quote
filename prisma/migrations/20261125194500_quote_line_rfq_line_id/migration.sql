ALTER TABLE "QuoteLineItem" ADD COLUMN IF NOT EXISTS "rfqLineId" INTEGER;

CREATE INDEX IF NOT EXISTS "QuoteLineItem_quoteId_rfqLineId_idx" ON "QuoteLineItem"("quoteId", "rfqLineId");