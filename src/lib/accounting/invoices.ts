import type { Prisma, UqcCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { allocateNextNumber } from "@/lib/accounting/document-series";
import { ensureOpenPeriod } from "@/lib/accounting/fiscal";
import { findOrCreateCustomerFromBuyer, partyBillingSnapshot } from "@/lib/accounting/parties";
import { calculateDocumentTotals, TAX_RULE_VERSION } from "@/lib/accounting/tax-engine";
import { getStateCode } from "@/lib/accounting/states";
import { toNumber, round2 } from "@/lib/accounting/money";
import { writeAuditEvent } from "@/lib/accounting/audit";
import { recordStockMovement } from "@/lib/accounting/inventory";
import { getAccountBySystemKey, postBalancedJournal } from "@/lib/accounting/journals";
import { AccountingError } from "@/lib/accounting/errors";

function mapUnitToUqc(unit: string): UqcCode {
  const u = unit.trim().toUpperCase();
  const allowed = new Set([
    "BAG","BAL","BDL","BKL","BOU","BOX","BTL","BUN","CAN","CBM","CCM","CMS","CTN","DOZ","DRM","GGR","GMS","GRS","GYD","KGS","KLR","KME","LTR","MLT","MTR","MTS","NOS","PAC","PCS","PRS","QTL","ROL","SET","SQF","SQM","SQY","TBS","TGM","THD","TON","TUB","UGS","UNT","YDS","OTH",
  ]);
  if (u === "PC" || u === "PCS" || u === "PIECE" || u === "PIECES") return "NOS";
  if (allowed.has(u)) return u as UqcCode;
  return "NOS";
}

async function loadQuote(quoteId: string) {
  return prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      lineItems: { include: { product: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function createProformaFromQuote(quoteId: string, userId?: string) {
  const ctx = await getDefaultOrgContext();
  const quote = await loadQuote(quoteId);

  // Resolve fiscal period + party outside the write transaction — Neon latency was
  // blowing the default 5s interactive transaction timeout.
  const period = await ensureOpenPeriod(prisma, {
    organisationId: ctx.organisationId,
    legalEntityId: ctx.legalEntityId,
    date: new Date(),
  });

  const party = await findOrCreateCustomerFromBuyer(prisma, ctx.organisationId, {
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    buyerGstin: quote.buyerGstin || undefined,
  });

  return prisma.$transaction(
    async (tx) => {
      const partyFull = await tx.party.findUniqueOrThrow({
        where: { id: party.id },
        include: { addresses: true },
      });

      const placeOfSupplyCode =
        partyFull.placeOfSupplyCode ||
        getStateCode(quote.buyerState) ||
        ctx.stateCode;

      const { number } = await allocateNextNumber(tx, {
        organisationId: ctx.organisationId,
        gstRegistrationId: ctx.gstRegistrationId,
        documentType: "PROFORMA_INVOICE",
        fiscalYearId: period.fiscalYearId,
        fiscalYearLabel: period.fiscalYearLabel,
        prefix: "PI",
        sourceType: "Quote",
        sourceId: quote.id,
      });

      const calc = calculateDocumentTotals({
        lines: quote.lineItems.map((l) => ({
          qty: toNumber(l.qty),
          unitPrice: toNumber(l.unitPrice),
          taxRate: toNumber(l.taxRate),
        })),
        sellerStateCode: ctx.stateCode,
        placeOfSupplyCode,
        withGst: quote.withGst,
        headerDiscountAmount: toNumber(quote.discountAmount),
        freightAmount: toNumber(quote.deliveryCharge),
        freightTaxable: false,
      });

      const proforma = await tx.proformaInvoice.create({
        data: {
          organisationId: ctx.organisationId,
          gstRegistrationId: ctx.gstRegistrationId,
          partyId: party.id,
          quoteId: quote.id,
          number,
          status: "DRAFT",
          issueDate: new Date(),
          placeOfSupplyCode,
          subtotal: calc.subtotal,
          taxAmount: calc.gstAmount,
          total: calc.grandTotal,
          billingSnapshot: partyBillingSnapshot(partyFull),
          terms: { notes: quote.notes, ruleVersion: calc.ruleVersion },
          lines: {
            create: quote.lineItems.map((l, i) => {
              const tl = calc.lines[i];
              return {
                lineNumber: i + 1,
                productId: l.productId,
                description:
                  l.aliasName?.trim() ||
                  l.description ||
                  l.product?.name ||
                  "Item",
                hsnCode: l.product?.hsnCode ?? null,
                uqc: mapUnitToUqc(l.unit || l.product?.unit || "pcs"),
                quantity: toNumber(l.qty),
                unitPrice: toNumber(l.unitPrice),
                discountAmount: tl.lineDiscount,
                taxableValue: tl.taxableValue,
                taxRate: tl.taxRate,
                cgstAmount: tl.cgstAmount,
                sgstAmount: tl.sgstAmount,
                igstAmount: tl.igstAmount,
                lineTotal: tl.lineTotal,
              };
            }),
          },
        },
        include: { lines: true, party: true },
      });

      await writeAuditEvent({
        organisationId: ctx.organisationId,
        actorUserId: userId,
        action: "PROFORMA_CREATED",
        entityType: "ProformaInvoice",
        entityId: proforma.id,
        after: { number: proforma.number, quoteId },
        tx,
      });

      return proforma;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
}

export async function issueProforma(proformaId: string, userId?: string) {
  const proforma = await prisma.proformaInvoice.findUniqueOrThrow({
    where: { id: proformaId },
  });
  if (proforma.status !== "DRAFT") throw new Error("Only draft proformas can be issued");

  const updated = await prisma.proformaInvoice.update({
    where: { id: proformaId },
    data: { status: "ISSUED", issuedAt: new Date() },
    include: { lines: true, party: true },
  });

  await writeAuditEvent({
    organisationId: proforma.organisationId,
    actorUserId: userId,
    action: "PROFORMA_ISSUED",
    entityType: "ProformaInvoice",
    entityId: proformaId,
  });

  return updated;
}

async function buildInvoiceFromLines(
  tx: Prisma.TransactionClient,
  opts: {
    ctx: Awaited<ReturnType<typeof getDefaultOrgContext>>;
    partyId: string;
    placeOfSupplyCode: string;
    withGst: boolean;
    discountAmount: number;
    freightAmount: number;
    lines: Array<{
      productId: string | null;
      description: string;
      hsnCode: string | null;
      uqc: UqcCode;
      qty: number;
      unitPrice: number;
      taxRate: number;
    }>;
    proformaInvoiceId?: string | null;
    quoteId?: string | null;
    notes?: string;
    userId?: string;
    /** Prefetch outside the write transaction to avoid Neon latency timeouts. */
    period?: Awaited<ReturnType<typeof ensureOpenPeriod>>;
  }
) {
  const period =
    opts.period ??
    (await ensureOpenPeriod(tx, {
      organisationId: opts.ctx.organisationId,
      legalEntityId: opts.ctx.legalEntityId,
      date: new Date(),
    }));

  const { number } = await allocateNextNumber(tx, {
    organisationId: opts.ctx.organisationId,
    gstRegistrationId: opts.ctx.gstRegistrationId,
    documentType: "TAX_INVOICE",
    fiscalYearId: period.fiscalYearId,
    fiscalYearLabel: period.fiscalYearLabel,
    prefix: "INV",
    sourceType: opts.proformaInvoiceId ? "ProformaInvoice" : "Quote",
    sourceId: opts.proformaInvoiceId ?? opts.quoteId ?? undefined,
  });

  const calc = calculateDocumentTotals({
    lines: opts.lines.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
    })),
    sellerStateCode: opts.ctx.stateCode,
    placeOfSupplyCode: opts.placeOfSupplyCode,
    withGst: opts.withGst,
    headerDiscountAmount: opts.discountAmount,
    freightAmount: opts.freightAmount,
    freightTaxable: false,
  });

  const partyFull = await tx.party.findUniqueOrThrow({
    where: { id: opts.partyId },
    include: { addresses: true },
  });

  const snapshot = {
    ruleVersion: calc.ruleVersion || TAX_RULE_VERSION,
    seller: {
      name: opts.ctx.tradeName,
      gstin: opts.ctx.gstin,
      stateCode: opts.ctx.stateCode,
    },
    buyer: partyBillingSnapshot(partyFull),
    calc,
  };

  const invoice = await tx.invoice.create({
    data: {
      organisationId: opts.ctx.organisationId,
      gstRegistrationId: opts.ctx.gstRegistrationId,
      partyId: opts.partyId,
      proformaInvoiceId: opts.proformaInvoiceId ?? null,
      number,
      status: "DRAFT",
      issueDate: new Date(),
      placeOfSupplyCode: opts.placeOfSupplyCode,
      subtotal: calc.subtotal,
      taxAmount: calc.gstAmount,
      total: calc.grandTotal,
      balanceDue: calc.grandTotal,
      billingSnapshot: partyBillingSnapshot(partyFull),
      immutableSnapshot: snapshot,
      lines: {
        create: opts.lines.map((l, i) => {
          const tl = calc.lines[i];
          return {
            lineNumber: i + 1,
            productId: l.productId,
            description: l.description,
            hsnCode: l.hsnCode,
            uqc: l.uqc,
            quantity: l.qty,
            unitPrice: l.unitPrice,
            discountAmount: tl.lineDiscount,
            taxableValue: tl.taxableValue,
            taxRate: tl.taxRate,
            cgstAmount: tl.cgstAmount,
            sgstAmount: tl.sgstAmount,
            igstAmount: tl.igstAmount,
            lineTotal: tl.lineTotal,
          };
        }),
      },
    },
    include: { lines: true, party: true },
  });

  await writeAuditEvent({
    organisationId: opts.ctx.organisationId,
    actorUserId: opts.userId,
    action: "INVOICE_CREATED",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { number: invoice.number },
    tx,
  });

  return invoice;
}

export async function createTaxInvoiceFromQuote(
  _quoteId: string,
  _userId?: string,
  _opts?: { warehouseId?: string; issue?: boolean }
): Promise<never> {
  throw new AccountingError(
    "Direct tax invoices from quotes are disabled. Create and issue a proforma (dummy invoice), record payment, then convert to a tax invoice.",
    "PROFORMA_REQUIRED",
    400
  );
}

export async function recordProformaPayment(
  proformaId: string,
  input: {
    amount: number;
    method?: "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "CHEQUE" | "DEMAND_DRAFT" | "OTHER";
    reference?: string;
    paymentDate?: Date;
    userId?: string;
  }
) {
  const amount = round2(input.amount);
  if (amount <= 0) {
    throw new AccountingError("Payment amount must be positive", "INVALID_PAYMENT", 400);
  }

  const proforma = await prisma.proformaInvoice.findUniqueOrThrow({
    where: { id: proformaId },
    include: { party: true },
  });
  if (proforma.status === "CANCELLED" || proforma.status === "VOID") {
    throw new AccountingError("Cannot record payment on a cancelled proforma", "PROFORMA_CANCELLED", 400);
  }
  if (proforma.status === "DRAFT") {
    throw new AccountingError("Issue the proforma before recording payment", "PROFORMA_NOT_ISSUED", 400);
  }

  const alreadyPaid = toNumber(proforma.amountPaid);
  const total = toNumber(proforma.total);
  const nextPaid = round2(alreadyPaid + amount);
  if (nextPaid - total > 0.01) {
    throw new AccountingError(
      `Payment would exceed proforma total (paid ${alreadyPaid}, total ${total})`,
      "PAYMENT_EXCEEDS_TOTAL",
      400
    );
  }

  const ctx = await getDefaultOrgContext();
  const period = await ensureOpenPeriod(prisma, {
    organisationId: ctx.organisationId,
    legalEntityId: ctx.legalEntityId,
    date: input.paymentDate ?? new Date(),
  });

  // Advance receipt against party before tax invoice exists
  const updated = await prisma.$transaction(
    async (tx) => {
    const { allocateNextNumber } = await import("@/lib/accounting/document-series");
    const { getAccountBySystemKey: getAcct, postBalancedJournal: postJv } = await import(
      "@/lib/accounting/journals"
    );
    const { number } = await allocateNextNumber(tx, {
      organisationId: ctx.organisationId,
      documentType: "PAYMENT_RECEIPT",
      fiscalYearId: period.fiscalYearId,
      fiscalYearLabel: period.fiscalYearLabel,
      prefix: "ADV",
      sourceType: "ProformaInvoice",
      sourceId: proforma.id,
    });
    const method = input.method ?? "BANK_TRANSFER";
    const cashOrBank = await getAcct(tx, ctx.legalEntityId, method === "CASH" ? "CASH" : "BANK");
    const ar = await getAcct(tx, ctx.legalEntityId, "ACCOUNTS_RECEIVABLE");

    const payment = await tx.payment.create({
      data: {
        organisationId: ctx.organisationId,
        partyId: proforma.partyId,
        accountId: cashOrBank.id,
        number,
        direction: "RECEIPT",
        method,
        status: "CLEARED",
        paymentDate: input.paymentDate ?? new Date(),
        amount,
        reference: input.reference || `Advance for ${proforma.number}`,
        clearedAt: new Date(),
        metadata: { proformaInvoiceId: proforma.id, kind: "PROFORMA_ADVANCE" },
      },
    });

    await postJv(tx, {
      organisationId: ctx.organisationId,
      legalEntityId: ctx.legalEntityId,
      entryDate: input.paymentDate ?? new Date(),
      sourceType: "ProformaAdvance",
      sourceId: payment.id,
      narration: `Advance against proforma ${proforma.number}`,
      idempotencyKey: `proforma-adv-${payment.id}`,
      lines: [
        { accountId: cashOrBank.id, debit: amount, description: `Advance ${number}` },
        {
          accountId: ar.id,
          partyId: proforma.partyId,
          credit: amount,
          description: `Customer advance ${proforma.number}`,
        },
      ],
    });

    return tx.proformaInvoice.update({
      where: { id: proforma.id },
      data: {
        amountPaid: nextPaid,
        paymentReceivedAt: new Date(),
        status: proforma.status === "DRAFT" ? "ISSUED" : proforma.status,
        issuedAt: proforma.issuedAt ?? new Date(),
        terms: {
          ...((proforma.terms as Record<string, unknown>) || {}),
          lastAdvancePaymentId: payment.id,
          lastAdvanceAmount: amount,
        },
      },
      include: { lines: true, party: true, invoices: true },
    });
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  await writeAuditEvent({
    organisationId: proforma.organisationId,
    actorUserId: input.userId,
    action: "PROFORMA_PAYMENT_RECORDED",
    entityType: "ProformaInvoice",
    entityId: proforma.id,
    after: { amountPaid: nextPaid, paymentAmount: amount },
  });

  return updated;
}

export async function convertProformaToTaxInvoice(
  proformaId: string,
  userId?: string,
  opts?: { warehouseId?: string; issue?: boolean }
) {
  const ctx = await getDefaultOrgContext();
  const proforma = await prisma.proformaInvoice.findUniqueOrThrow({
    where: { id: proformaId },
    include: { lines: true, party: true },
  });

  if (proforma.status === "CANCELLED" || proforma.status === "VOID") {
    throw new AccountingError("Cannot convert a cancelled proforma", "PROFORMA_CANCELLED", 400);
  }
  if (toNumber(proforma.amountPaid) <= 0) {
    throw new AccountingError(
      "Record payment against this proforma before creating the GST tax invoice. Dummy (proforma) invoice must be paid first.",
      "PAYMENT_REQUIRED",
      400
    );
  }

  const partyGstin = proforma.party.gstin?.trim();
  if (!partyGstin) {
    throw new AccountingError(
      "Client GSTIN is required before creating a tax invoice. Onboard the client GSTIN (fetch from portal) and try again.",
      "CLIENT_GSTIN_REQUIRED",
      400
    );
  }

  const period = await ensureOpenPeriod(prisma, {
    organisationId: ctx.organisationId,
    legalEntityId: ctx.legalEntityId,
    date: new Date(),
  });

  const invoice = await prisma.$transaction(
    async (tx) => {
    const created = await buildInvoiceFromLines(tx, {
      ctx,
      partyId: proforma.partyId,
      placeOfSupplyCode: proforma.placeOfSupplyCode,
      withGst: true,
      discountAmount: 0,
      freightAmount: 0,
      proformaInvoiceId: proforma.id,
      quoteId: proforma.quoteId,
      userId,
      period,
      lines: proforma.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        hsnCode: l.hsnCode,
        uqc: l.uqc,
        qty: toNumber(l.quantity),
        unitPrice: toNumber(l.unitPrice),
        taxRate: toNumber(l.taxRate),
      })),
    });

    if (proforma.status === "DRAFT") {
      await tx.proformaInvoice.update({
        where: { id: proforma.id },
        data: { status: "ISSUED", issuedAt: new Date() },
      });
    }

    return created;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  if (opts?.issue !== false) {
    return issueTaxInvoice(invoice.id, userId, { warehouseId: opts?.warehouseId });
  }
  return invoice;
}

export async function issueTaxInvoice(
  invoiceId: string,
  userId?: string,
  opts?: { warehouseId?: string; skipStock?: boolean }
) {
  const ctx = await getDefaultOrgContext();

  const existing = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { party: true },
  });
  if (!existing.party.gstin?.trim()) {
    throw new AccountingError(
      "Client GSTIN is required before issuing a tax invoice. Onboard the client GSTIN first.",
      "CLIENT_GSTIN_REQUIRED",
      400
    );
  }

  return prisma.$transaction(
    async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: { include: { product: true } }, party: true },
    });
    if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be issued");

    const warehouseId = opts?.warehouseId ?? ctx.warehouseId;
    let cogsTotal = 0;

    if (!opts?.skipStock) {
      for (const line of invoice.lines) {
        if (!line.productId || line.product?.productType === "SERVICE") continue;
        const movement = await recordStockMovement(tx, {
          gstRegistrationId: invoice.gstRegistrationId,
          warehouseId,
          productId: line.productId,
          invoiceId: invoice.id,
          type: "SALE",
          quantity: toNumber(line.quantity),
          sourceType: "Invoice",
          sourceId: invoice.id,
          idempotencyKey: `sale-${invoice.id}-${line.id}`,
        });
        cogsTotal = round2(cogsTotal + toNumber(movement.value));
      }
    }

    const ar = await getAccountBySystemKey(tx, ctx.legalEntityId, "ACCOUNTS_RECEIVABLE");
    const sales = await getAccountBySystemKey(tx, ctx.legalEntityId, "SALES");
    const outputGst = await getAccountBySystemKey(tx, ctx.legalEntityId, "OUTPUT_GST");
    const inventory = await getAccountBySystemKey(tx, ctx.legalEntityId, "INVENTORY");
    const cogs = await getAccountBySystemKey(tx, ctx.legalEntityId, "COGS");

    const taxable = round2(toNumber(invoice.total) - toNumber(invoice.taxAmount));
    const journalLines: Array<{
      accountId: string;
      partyId?: string | null;
      description?: string;
      debit?: number;
      credit?: number;
    }> = [
      {
        accountId: ar.id,
        partyId: invoice.partyId,
        description: `Invoice ${invoice.number}`,
        debit: toNumber(invoice.total),
      },
      {
        accountId: sales.id,
        description: `Sales ${invoice.number}`,
        credit: taxable,
      },
    ];
    if (toNumber(invoice.taxAmount) > 0) {
      journalLines.push({
        accountId: outputGst.id,
        description: `Output GST ${invoice.number}`,
        credit: toNumber(invoice.taxAmount),
      });
    }
    if (cogsTotal > 0) {
      journalLines.push(
        { accountId: cogs.id, description: `COGS ${invoice.number}`, debit: cogsTotal },
        { accountId: inventory.id, description: `Inventory out ${invoice.number}`, credit: cogsTotal }
      );
    }

    await postBalancedJournal(tx, {
      organisationId: ctx.organisationId,
      legalEntityId: ctx.legalEntityId,
      entryDate: invoice.issueDate,
      sourceType: "Invoice",
      sourceId: invoice.id,
      narration: `Tax invoice ${invoice.number}`,
      idempotencyKey: `invoice-post-${invoice.id}`,
      lines: journalLines,
    });

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        balanceDue: invoice.total,
      },
      include: { lines: true, party: true },
    });

    if (invoice.proformaInvoiceId) {
      const pf = await tx.proformaInvoice.findUnique({
        where: { id: invoice.proformaInvoiceId },
      });
      if (pf?.quoteId) {
        await tx.quote.update({
          where: { id: pf.quoteId },
          data: { status: "INVOICE_GENERATED" },
        });
      }
    }

    await writeAuditEvent({
      organisationId: ctx.organisationId,
      actorUserId: userId,
      action: "INVOICE_ISSUED",
      entityType: "Invoice",
      entityId: invoice.id,
      after: { number: invoice.number, total: toNumber(invoice.total), cogsTotal },
      tx,
    });

    return updated;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}

export async function cancelInvoice(invoiceId: string, userIdOrReason: string, reasonMaybe?: string) {
  // Support both (id, reason, userId) and API style (id, userId, reason)
  const userId = reasonMaybe != null ? userIdOrReason : undefined;
  const reason = reasonMaybe != null ? reasonMaybe : userIdOrReason;

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === "CANCELLED" || invoice.status === "VOID") {
    throw new Error("Invoice already cancelled");
  }
  if (toNumber(invoice.balanceDue) < toNumber(invoice.total) - 0.01) {
    throw new Error("Cannot cancel a partially paid invoice; issue a credit note instead");
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "CANCELLED", cancelledAt: new Date(), balanceDue: 0 },
    include: { lines: true, party: true },
  });

  await writeAuditEvent({
    organisationId: invoice.organisationId,
    actorUserId: userId,
    action: "INVOICE_CANCELLED",
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: { reason },
  });

  return updated;
}

function decimalFields<T extends Record<string, unknown>>(row: T, keys: string[]) {
  const out: Record<string, unknown> = { ...row };
  for (const key of keys) {
    if (key in out) out[key] = toNumber(out[key]);
  }
  return out;
}

export function serializeInvoice(invoice: {
  id: string;
  number: string;
  status: string;
  issueDate: Date;
  dueDate?: Date | null;
  placeOfSupplyCode: string;
  subtotal: unknown;
  taxAmount: unknown;
  roundOff?: unknown;
  total: unknown;
  balanceDue: unknown;
  billingSnapshot?: unknown;
  immutableSnapshot?: unknown;
  issuedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  party?: unknown;
  proformaInvoice?: unknown;
  paymentAllocations?: unknown;
  lines?: Array<Record<string, unknown>>;
}) {
  return {
    ...invoice,
    subtotal: toNumber(invoice.subtotal),
    taxAmount: toNumber(invoice.taxAmount),
    roundOff: toNumber(invoice.roundOff),
    total: toNumber(invoice.total),
    balanceDue: toNumber(invoice.balanceDue),
    lines: (invoice.lines || []).map((l) =>
      decimalFields(l, [
        "quantity",
        "unitPrice",
        "discountAmount",
        "taxableValue",
        "taxRate",
        "cgstAmount",
        "sgstAmount",
        "igstAmount",
        "cessAmount",
        "lineTotal",
      ])
    ),
  };
}

export function serializeProforma(proforma: {
  id: string;
  number: string;
  status: string;
  issueDate: Date;
  placeOfSupplyCode: string;
  subtotal: unknown;
  taxAmount: unknown;
  total: unknown;
  amountPaid?: unknown;
  paymentReceivedAt?: Date | null;
  billingSnapshot?: unknown;
  issuedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  party?: unknown;
  quote?: unknown;
  invoices?: unknown;
  lines?: Array<Record<string, unknown>>;
}) {
  const total = toNumber(proforma.total);
  const amountPaid = toNumber(proforma.amountPaid);
  const hasClientGstin = Boolean(
    proforma.party && typeof proforma.party === "object" && "gstin" in proforma.party
      ? String((proforma.party as { gstin?: string | null }).gstin || "").trim()
      : ""
  );
  return {
    ...proforma,
    subtotal: toNumber(proforma.subtotal),
    taxAmount: toNumber(proforma.taxAmount),
    total,
    amountPaid,
    balanceDue: round2(Math.max(0, total - amountPaid)),
    hasClientGstin,
    canConvertToTaxInvoice: amountPaid > 0 && hasClientGstin,
    lines: (proforma.lines || []).map((l) =>
      decimalFields(l, [
        "quantity",
        "unitPrice",
        "discountAmount",
        "taxableValue",
        "taxRate",
        "cgstAmount",
        "sgstAmount",
        "igstAmount",
        "cessAmount",
        "lineTotal",
      ])
    ),
  };
}
