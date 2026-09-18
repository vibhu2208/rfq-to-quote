-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('HUMAN_REPLY', 'MANUAL');

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "KnowledgeSource" NOT NULL DEFAULT 'HUMAN_REPLY',
    "quoteId" TEXT,
    "inboundMessageId" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "embedding" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeEntry_active_idx" ON "KnowledgeEntry"("active");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_quoteId_idx" ON "KnowledgeEntry"("quoteId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_createdAt_idx" ON "KnowledgeEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
