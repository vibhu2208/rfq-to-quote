import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import {
  importGstr2bAndReconcile,
  prepareGstr1Draft,
  prepareGstr3bSummary,
} from "@/lib/accounting/gst-returns";
import { submitEInvoiceWithApproval, submitGstReturnWithApproval } from "@/lib/accounting/filing";
import { createDraftFromCsvRows, createDraftFromNaturalLanguage } from "@/lib/accounting/transactions";
import { getTrialBalance, getArAgeing } from "@/lib/accounting/reports";
import { isAccountingError } from "@/lib/accounting/errors";
import { getGstConfigurationSummary, verifyAndStorePartyGstin } from "@/lib/accounting/gstin";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "returns";

  if (view === "trial-balance") {
    return NextResponse.json(await getTrialBalance());
  }
  if (view === "ar-ageing") {
    return NextResponse.json(await getArAgeing());
  }
  if (view === "config") {
    return NextResponse.json(getGstConfigurationSummary());
  }

  const returns = await prisma.gstReturn.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const reconciliations = await prisma.gstReconciliation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ returns, reconciliations, config: getGstConfigurationSummary() });
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_gstr1"), period: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ action: z.literal("prepare_gstr3b"), period: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({
    action: z.literal("import_gstr2b"),
    rows: z.array(
      z.object({
        supplierGstin: z.string().optional(),
        invoiceNumber: z.string().optional(),
        invoiceDate: z.string().optional(),
        taxable: z.number().optional(),
        igst: z.number().optional(),
        cgst: z.number().optional(),
        sgst: z.number().optional(),
        externalRef: z.string().optional(),
      })
    ),
  }),
  z.object({ action: z.literal("file_return"), gstReturnId: z.string(), approved: z.literal(true) }),
  z.object({ action: z.literal("einvoice"), invoiceId: z.string(), approved: z.literal(true) }),
  z.object({ action: z.literal("nl_draft"), text: z.string().min(3) }),
  z.object({ action: z.literal("csv_drafts"), rows: z.array(z.record(z.string(), z.string())) }),
  z.object({
    action: z.literal("verify_gstin"),
    gstin: z.string().min(15).max(15),
    partyId: z.string().optional(),
    createPartyIfMissing: z.boolean().optional(),
    legalNameHint: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = parsed.data;
    switch (data.action) {
      case "prepare_gstr1":
        return NextResponse.json(await prepareGstr1Draft(data.period, userId), { status: 201 });
      case "prepare_gstr3b":
        return NextResponse.json(await prepareGstr3bSummary(data.period), { status: 201 });
      case "import_gstr2b":
        return NextResponse.json(await importGstr2bAndReconcile(data.rows, userId), { status: 201 });
      case "file_return":
        return NextResponse.json(
          await submitGstReturnWithApproval({
            gstReturnId: data.gstReturnId,
            approvedByUserId: userId,
          })
        );
      case "einvoice":
        return NextResponse.json(
          await submitEInvoiceWithApproval({
            invoiceId: data.invoiceId,
            approvedByUserId: userId,
          })
        );
      case "nl_draft":
        return NextResponse.json(await createDraftFromNaturalLanguage(data.text, userId), {
          status: 201,
        });
      case "csv_drafts":
        return NextResponse.json(await createDraftFromCsvRows(data.rows, userId), { status: 201 });
      case "verify_gstin":
        return NextResponse.json(
          await verifyAndStorePartyGstin({
            gstin: data.gstin,
            partyId: data.partyId,
            createPartyIfMissing: data.createPartyIfMissing ?? true,
            legalNameHint: data.legalNameHint,
            userId,
          })
        );
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
