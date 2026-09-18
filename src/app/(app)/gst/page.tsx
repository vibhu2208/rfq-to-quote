import { GstWorkspace } from "@/components/gst-workspace";
import { prisma } from "@/lib/prisma";
import { getGstConfigurationSummary } from "@/lib/accounting/gstin";

export default async function GstPage() {
  const [returns, reconciliations, drafts] = await Promise.all([
    prisma.gstReturn.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.gstReconciliation.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.transactionDraft.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const config = getGstConfigurationSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GST & capture</h1>
        <p className="mt-1 text-sm text-mid-green">
          Verify GSTINs, prepare returns, and file only with explicit approval. Tax invoices require
          proforma + payment first.
        </p>
      </div>
      <GstWorkspace
        config={config}
        returns={returns.map((r) => ({
          id: r.id,
          type: r.type,
          period: r.period,
          status: r.status,
          arn: r.arn,
          summary: r.summary,
        }))}
        reconciliations={reconciliations.map((r) => ({
          id: r.id,
          status: r.status,
          externalInvoiceRef: r.externalInvoiceRef,
        }))}
        drafts={drafts.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
