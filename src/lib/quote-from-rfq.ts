import { prisma } from "@/lib/prisma";
import { nextQuoteNumber, decimalToNumber } from "@/lib/quotes";
import { catalogSellPrice, resolveQuoteUnitPrice } from "@/lib/product-price";
import { extractRfqItems } from "@/lib/rfq-items";
import {
  matchProductsToRfqItems,
  shouldAutoBindCatalogMatch,
} from "@/lib/product-match";
import { matchRfqCatalogHybrid } from "@/lib/hybrid-catalog-match";
import {
  quoteLinePresentation,
  requirementForProduct,
} from "@/lib/quote-line-alias";
import { persistQuoteLineVendorCosts } from "@/lib/quote-line-cost-persist";
import {
  QuoteLineValidationError,
  sanitizeQuoteLinesForCreate,
  type QuoteLineSanitizeInput,
} from "@/lib/quote-line-sanitize";
import { round2 } from "@/lib/accounting/money";
import {
  mergeDraftQuoteLines,
  type DraftMergeChange,
} from "@/lib/quote-draft-merge";

export type QuoteFromRfqLine = {
  productId: string | null;
  qty: number;
  unitPrice?: number;
  costPrice?: number;
  costVendorName?: string;
  aliasName?: string;
  unit?: string;
  /** RFQ workspace line — stable key for draft sync merge. */
  rfqLineId?: number;
  /** True when top catalog hit was skipped as weak/mismatched. */
  matchWeak?: boolean;
};

export type CreateQuoteFromRfqInput = {
  rfqId: string;
  productIds?: string[];
  quantities?: Record<string, number>;
  lines?: QuoteFromRfqLine[];
  buyerGstin?: string;
  buyerAddress?: string;
  buyerState?: string;
  /** When set, refresh this draft instead of creating a second quote. */
  updateQuoteId?: string;
};

export { QuoteLineValidationError };

export async function previewSyncDraftQuoteFromRfq(
  input: CreateQuoteFromRfqInput
): Promise<{ changes: DraftMergeChange[]; lineCount: number } | null> {
  const explicit = input.lines || [];
  if (explicit.length === 0 || !explicit.every((l) => typeof l.rfqLineId === "number")) {
    return null;
  }

  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
  if (!rfq) throw new Error("RFQ not found");

  const updating =
    input.updateQuoteId != null
      ? await prisma.quote.findFirst({
          where: {
            id: input.updateQuoteId,
            rfqId: rfq.id,
            status: "DRAFT",
          },
        })
      : await prisma.quote.findFirst({
          where: { rfqId: rfq.id, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
        });
  if (!updating) return null;

  const existingRows = await prisma.quoteLineItem.findMany({
    where: { quoteId: updating.id },
    orderBy: { sortOrder: "asc" },
  });

  const productIds = explicit
    .map((l) => l.productId)
    .filter((id): id is string => Boolean(id));
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({ where: { id: { in: productIds } } })
      : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const { changes, lines } = mergeDraftQuoteLines(
    existingRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      aliasName: row.aliasName,
      description: row.description,
      qty: decimalToNumber(row.qty),
      unit: row.unit,
      unitPrice: decimalToNumber(row.unitPrice),
      costPrice: row.costPrice != null ? decimalToNumber(row.costPrice) : null,
      costVendorName: row.costVendorName,
      discountPercent: decimalToNumber(row.discountPercent ?? 0),
      taxRate: decimalToNumber(row.taxRate),
      sortOrder: row.sortOrder,
      customItem: row.customItem,
    })),
    explicit.map((line) => ({
      rfqLineId: line.rfqLineId!,
      productId: line.productId,
      aliasName: line.aliasName,
      unit: line.unit,
      qty: line.qty,
      unitPrice: line.unitPrice,
      costPrice: line.costPrice,
      costVendorName: line.costVendorName,
    })),
    {
      catalogUnitPrice: (productId) => {
        const product = byId.get(productId);
        return product ? catalogSellPrice(product) : undefined;
      },
    }
  );

  return { changes, lineCount: lines.length };
}

export async function syncDraftQuoteFromRfq(input: CreateQuoteFromRfqInput) {
  const existing = input.updateQuoteId
    ? await prisma.quote.findFirst({
        where: {
          id: input.updateQuoteId,
          rfqId: input.rfqId,
          status: "DRAFT",
        },
      })
    : await prisma.quote.findFirst({
        where: { rfqId: input.rfqId, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
      });
  if (!existing) return createQuoteFromRfq(input);
  return createQuoteFromRfq({ ...input, updateQuoteId: existing.id });
}

export async function createQuoteFromRfq(input: CreateQuoteFromRfqInput) {
  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
  if (!rfq) throw new Error("RFQ not found");

  const productIds = input.productIds || [];
  const quantities = input.quantities || {};
  const explicitLines = input.lines || [];

  const specs = rfq.parsedSpecs as Record<string, unknown> | null;
  const meta = (specs?._meta as { summary?: string } | undefined) || {};
  const requirementItems = extractRfqItems(specs, rfq.rawText);
  const defaultQty =
    typeof specs?.quantity === "number" && specs.quantity > 0 ? specs.quantity : 1;

  const updating = input.updateQuoteId
    ? await prisma.quote.findFirst({
        where: {
          id: input.updateQuoteId,
          rfqId: rfq.id,
          status: "DRAFT",
        },
      })
    : null;
  const quoteNumber = updating?.quoteNumber ?? (await nextQuoteNumber());

  type LineCreate = {
    productId: string | null;
    description: string;
    aliasName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    costPrice?: number | null;
    costVendorName?: string;
    taxRate: number;
    lineTotal: number;
    sortOrder: number;
    id?: string;
    discountPercent?: number;
    customItem?: boolean;
  };

  const canMergeDraft =
    Boolean(updating) &&
    explicitLines.length > 0 &&
    explicitLines.every((l) => typeof l.rfqLineId === "number");
  let mergedDraft = false;
  let lines: LineCreate[] = [];

  const buildLine = (
    p: {
      id: string;
      name: string;
      description: string;
      unit: string;
      offerPrice: unknown;
      lastPrice?: unknown;
      taxRate: unknown;
    },
    qty: number,
    sortOrder: number,
    unitPriceOverride?: number,
    client?: {
      name?: string;
      code?: string | null;
      brand?: string | null;
      model?: string | null;
      unit?: string | null;
      extraNotes?: string | null;
    },
    cost?: {
      price?: number;
      vendorName?: string;
    }
  ): LineCreate => {
    const unitPrice = resolveQuoteUnitPrice(unitPriceOverride, p);
    const taxRate = decimalToNumber(p.taxRate);
    const presented = quoteLinePresentation({
      clientName: client?.name,
      clientCode: client?.code,
      clientBrand: client?.brand,
      clientModel: client?.model,
      clientUnit: client?.unit,
      extraNotes: client?.extraNotes,
      catalogName: p.name,
      catalogDescription: p.description || "",
      catalogUnit: p.unit,
    });
    return {
      productId: p.id,
      description: presented.description,
      aliasName: presented.aliasName,
      qty,
      unit: presented.unit,
      unitPrice,
      costPrice:
        cost?.price != null && Number.isFinite(cost.price) && cost.price > 0
          ? cost.price
          : null,
      costVendorName: cost?.vendorName?.trim() || "",
      taxRate,
      lineTotal: round2(qty * unitPrice),
      sortOrder,
    };
  };

  let lineRequests: QuoteFromRfqLine[] =
    explicitLines.length > 0
      ? explicitLines
      : productIds.map((pid) => ({
          productId: pid,
          qty: quantities[pid] ?? defaultQty,
        }));

  // Lead "Create quotation" posts with no lines — auto-match catalog so
  // sell prices (last → offer → MRP → base) land on the draft quote.
  if (lineRequests.length === 0) {
    lineRequests = await autoMatchQuoteLines(input.rfqId);
  }

  if (canMergeDraft) {
    mergedDraft = true;
    const existingRows = await prisma.quoteLineItem.findMany({
      where: { quoteId: updating!.id },
      orderBy: { sortOrder: "asc" },
    });
    const mergeProductIds = explicitLines
      .map((l) => l.productId)
      .filter((id): id is string => Boolean(id));
    const mergeProducts = mergeProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: mergeProductIds }, active: true },
        })
      : [];
    const mergeById = new Map(mergeProducts.map((p) => [p.id, p]));
    const claimed = new Set<number>();
    const { lines: merged } = mergeDraftQuoteLines(
      existingRows.map((row) => ({
        id: row.id,
        productId: row.productId,
        aliasName: row.aliasName,
        description: row.description,
        qty: decimalToNumber(row.qty),
        unit: row.unit,
        unitPrice: decimalToNumber(row.unitPrice),
        costPrice: row.costPrice != null ? decimalToNumber(row.costPrice) : null,
        costVendorName: row.costVendorName,
        discountPercent: decimalToNumber(row.discountPercent ?? 0),
        taxRate: decimalToNumber(row.taxRate),
        sortOrder: row.sortOrder,
        customItem: row.customItem,
      })),
      explicitLines.map((line) => ({
        rfqLineId: line.rfqLineId!,
        productId: line.productId,
        aliasName: line.aliasName,
        unit: line.unit,
        qty: line.qty,
        unitPrice: line.unitPrice,
        costPrice: line.costPrice,
        costVendorName: line.costVendorName,
      })),
      {
        catalogUnitPrice: (productId) => {
          const product = mergeById.get(productId);
          return product ? catalogSellPrice(product) : undefined;
        },
      }
    );

    lines = merged.map((row) => {
      const requirement = requirementItems[row.sortOrder - 1];
      if (!row.productId) {
        const presented = quoteLinePresentation({
          clientName: row.aliasName || requirement?.description || "From RFQ",
          clientCode: requirement?.code,
          clientBrand: requirement?.brand,
          clientModel: requirement?.model,
          clientUnit: row.unit || requirement?.unit,
          extraNotes: requirement?.extraNotes,
          catalogName: row.aliasName || requirement?.description || "From RFQ",
        });
        return {
          id: row.id,
          productId: null,
          description: presented.description,
          aliasName: presented.aliasName,
          qty: row.qty,
          unit: presented.unit,
          unitPrice: row.unitPrice,
          costPrice: row.costPrice,
          costVendorName: row.costVendorName || "",
          taxRate: row.taxRate,
          discountPercent: row.discountPercent,
          customItem: row.customItem ?? true,
          lineTotal: row.lineTotal,
          sortOrder: row.sortOrder,
        };
      }

      const p = mergeById.get(row.productId);
      if (!p) {
        return {
          id: row.id,
          productId: row.productId,
          description: row.description,
          aliasName: row.aliasName,
          qty: row.qty,
          unit: row.unit,
          unitPrice: row.unitPrice,
          costPrice: row.costPrice,
          costVendorName: row.costVendorName || "",
          taxRate: row.taxRate,
          discountPercent: row.discountPercent,
          customItem: row.customItem,
          lineTotal: row.lineTotal,
          sortOrder: row.sortOrder,
        };
      }

      const fromRequirement = requirementForProduct({
        productId: p.id,
        lineIndex: row.sortOrder - 1,
        requirements: requirementItems,
        topMatchProductIds: explicitLines
          .map((req) => req.productId)
          .filter((id): id is string => Boolean(id)),
        claimed,
      });
      const built = buildLine(
        p,
        row.qty,
        row.sortOrder,
        row.unitPrice > 0 ? row.unitPrice : undefined,
        {
          name: row.aliasName || fromRequirement?.description,
          code: fromRequirement?.code,
          brand: fromRequirement?.brand,
          model: fromRequirement?.model,
          unit: row.unit || fromRequirement?.unit,
          extraNotes: fromRequirement?.extraNotes,
        },
        {
          price: row.costPrice ?? undefined,
          vendorName: row.costVendorName,
        }
      );
      return {
        ...built,
        id: row.id,
        unitPrice: row.unitPrice > 0 ? row.unitPrice : built.unitPrice,
        discountPercent: row.discountPercent,
        customItem: row.customItem,
        lineTotal:
          row.lineTotal > 0
            ? row.lineTotal
            : round2(row.qty * (row.unitPrice > 0 ? row.unitPrice : built.unitPrice)),
      };
    });
  } else if (lineRequests.length > 0) {
    const ids = lineRequests
      .map((l) => l.productId)
      .filter((id): id is string => Boolean(id));
    let products = ids.length
      ? await prisma.product.findMany({
          where: { id: { in: ids }, active: true },
        })
      : [];
    if (products.length < ids.length) {
      const found = new Set(products.map((p) => p.id));
      const missing = ids.filter((id) => !found.has(id));
      const extra = await prisma.product.findMany({ where: { id: { in: missing } } });
      products = [...products, ...extra];
    }
    const byId = new Map(products.map((p) => [p.id, p]));
    const claimed = new Set<number>();
    const topMatchProductIds =
      lineRequests.length === requirementItems.length
        ? lineRequests.map((req) => req.productId)
        : [];
    lines = lineRequests.map((req, i) => {
      const qty = req.qty > 0 ? req.qty : 1;
      if (!req.productId) {
        const requirement = requirementItems[i];
        const presented = quoteLinePresentation({
          clientName: req.aliasName || requirement?.description || "From RFQ",
          clientCode: requirement?.code,
          clientBrand: requirement?.brand,
          clientModel: requirement?.model,
          clientUnit: req.unit || requirement?.unit,
          extraNotes: requirement?.extraNotes,
          catalogName: req.aliasName || requirement?.description || "From RFQ",
        });
        const unitPrice =
          req.unitPrice != null && req.unitPrice > 0
            ? req.unitPrice
            : requirement?.unitPrice != null && requirement.unitPrice > 0
              ? requirement.unitPrice
              : 0;
        const taxRate =
          requirement?.taxRate != null && requirement.taxRate >= 0
            ? requirement.taxRate
            : 18;
        return {
          productId: null,
          description: presented.description,
          aliasName: presented.aliasName,
          qty,
          unit: presented.unit,
          unitPrice,
          taxRate,
          lineTotal: round2(qty * unitPrice),
          sortOrder: i,
        } satisfies LineCreate;
      }

      const p = byId.get(req.productId);
      if (!p) {
        const presented = quoteLinePresentation({
          clientName: req.aliasName || "From RFQ",
          catalogName: req.aliasName || "From RFQ",
          clientUnit: req.unit,
        });
        return {
          productId: null,
          description: presented.description,
          aliasName: presented.aliasName,
          qty,
          unit: presented.unit,
          unitPrice: 0,
          taxRate: 18,
          lineTotal: 0,
          sortOrder: i,
        } satisfies LineCreate;
      }
      const fromRequirement = requirementForProduct({
        productId: p.id,
        lineIndex: i,
        requirements: requirementItems,
        topMatchProductIds: topMatchProductIds.filter(
          (id): id is string => Boolean(id)
        ),
        claimed,
      });
      return buildLine(
        p,
        qty,
        i,
        req.unitPrice,
        {
          name: req.aliasName || fromRequirement?.description,
          code: fromRequirement?.code,
          brand: fromRequirement?.brand,
          model: fromRequirement?.model,
          unit: req.unit || fromRequirement?.unit,
          extraNotes: fromRequirement?.extraNotes,
        },
        {
          price: req.costPrice,
          vendorName: req.costVendorName,
        }
      );
    });
  }

  if (lines.length === 0 && requirementItems.length > 1) {
    lines = requirementItems.map((item, i) => {
      const presented = quoteLinePresentation({
        clientName: item.description,
        clientCode: item.code,
        clientBrand: item.brand,
        clientModel: item.model,
        clientUnit: item.unit,
        extraNotes: item.extraNotes,
        catalogName: item.description,
      });
      const unitPrice =
        item.unitPrice != null && item.unitPrice > 0 ? item.unitPrice : 0;
      const taxRate =
        item.taxRate != null && item.taxRate >= 0 ? item.taxRate : 18;
      return {
        productId: null,
        description: presented.description,
        aliasName: presented.aliasName,
        qty: item.quantity,
        unit: presented.unit,
        unitPrice,
        taxRate,
        lineTotal: round2(item.quantity * unitPrice),
        sortOrder: i,
      };
    });
  }

  if (lines.length === 0) {
    const descParts = [
      rfq.parsedCategory || "RFQ line",
      typeof specs?.description === "string" ? specs.description : null,
      typeof specs?.brand === "string" ? `Brand: ${specs.brand}` : null,
      meta.summary || null,
    ].filter(Boolean);
    lines = [
      {
        productId: null,
        description: "",
        aliasName: descParts.join(" — ") || rfq.subject || "From RFQ",
        qty: defaultQty,
        unit: typeof specs?.unit === "string" ? specs.unit : "pcs",
        unitPrice: 0,
        taxRate: 18,
        lineTotal: 0,
        sortOrder: 0,
      },
    ];
  }

  lines = sanitizeQuoteLinesForCreate(lines as QuoteLineSanitizeInput[]);

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const gstAmount = round2(
    lines.reduce((s, l) => s + (l.lineTotal * l.taxRate) / 100, 0)
  );
  const grandTotal = round2(subtotal + gstAmount);

  const quote = await prisma.$transaction(
    async (tx) => {
      const header = {
        buyerName: rfq.customerName,
        buyerCompany: rfq.customerCompany,
        buyerEmail: rfq.customerEmail,
        buyerPhone: rfq.customerPhone,
        buyerGstin: input.buyerGstin || updating?.buyerGstin || "",
        buyerAddress: input.buyerAddress || updating?.buyerAddress || "",
        buyerState: input.buyerState || updating?.buyerState || "",
        withGst: true,
        subtotal,
        gstAmount,
        cgstAmount: round2(gstAmount / 2),
        sgstAmount: round2(gstAmount - round2(gstAmount / 2)),
        grandTotal,
      };

      const created = updating
        ? await tx.quote.update({
            where: { id: updating.id },
            data: header,
          })
        : await tx.quote.create({
            data: {
              quoteNumber,
              status: "DRAFT",
              rfqId: rfq.id,
              notes: "",
              ...header,
            },
          });

      if (mergedDraft) {
        const keepIds = lines.map((line) => line.id).filter(Boolean) as string[];
        if (keepIds.length > 0) {
          await tx.quoteLineItem.deleteMany({
            where: { quoteId: updating!.id, id: { notIn: keepIds } },
          });
        } else {
          await tx.quoteLineItem.deleteMany({ where: { quoteId: updating!.id } });
        }
        for (const line of lines) {
          const row = {
            productId: line.productId,
            description: line.description,
            aliasName: line.aliasName,
            qty: line.qty,
            unit: line.unit,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineTotal: line.lineTotal,
            sortOrder: line.sortOrder,
            discountPercent: line.discountPercent ?? 0,
            customItem: Boolean(line.customItem),
          };
          if (line.id) {
            await tx.quoteLineItem.update({
              where: { id: line.id },
              data: row,
            });
          } else {
            await tx.quoteLineItem.create({
              data: { quoteId: created.id, ...row },
            });
          }
        }
        await persistQuoteLineVendorCosts(tx, created.id, lines);
      } else if (updating) {
        await tx.quoteLineItem.deleteMany({ where: { quoteId: updating.id } });
        if (lines.length > 0) {
          await tx.quoteLineItem.createMany({
            data: lines.map((line) => ({
              quoteId: created.id,
              productId: line.productId,
              description: line.description,
              aliasName: line.aliasName,
              qty: line.qty,
              unit: line.unit,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              lineTotal: line.lineTotal,
              sortOrder: line.sortOrder,
            })),
          });
          await persistQuoteLineVendorCosts(tx, created.id, lines);
        }
      } else if (lines.length > 0) {
        await tx.quoteLineItem.createMany({
          data: lines.map((line) => ({
            quoteId: created.id,
            productId: line.productId,
            description: line.description,
            aliasName: line.aliasName,
            qty: line.qty,
            unit: line.unit,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineTotal: line.lineTotal,
            sortOrder: line.sortOrder,
          })),
        });
        await persistQuoteLineVendorCosts(tx, created.id, lines);
      }

      await tx.rfq.update({
        where: { id: rfq.id },
        data: { status: "QUOTED" },
      });

      return created;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  try {
    // Draft create must NOT advance leadStage to QUOTE_SENT — that happens on send
    // via syncLeadStageFromQuoteStatus(SENT). Keep activity for CRM history only.
    const { logLeadActivity } = await import("@/lib/leads/activity");
    await logLeadActivity({
      rfqId: rfq.id,
      type: "QUOTE_GENERATED",
      title: `Quote ${quote.quoteNumber} created`,
      meta: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
    });
  } catch {
    // CRM sync is best-effort
  }

  return quote;
}

export async function autoMatchQuoteLines(rfqId: string): Promise<QuoteFromRfqLine[]> {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) return [];

  const products = await prisma.product.findMany({ where: { active: true } });
  const input = {
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  };

  const { itemMatches, matches: overall } = await matchRfqCatalogHybrid(products, input);
  const lines: QuoteFromRfqLine[] = [];
  const used = new Set<string>();

  for (const item of itemMatches) {
    const top = item.matches[0];
    const qty = item.requirement.quantity > 0 ? item.requirement.quantity : 1;
    const aliasName = item.requirement.description;
    const unit = item.requirement.unit;
    const unitPrice =
      item.requirement.unitPrice != null && item.requirement.unitPrice > 0
        ? item.requirement.unitPrice
        : undefined;
    const reqText = [item.requirement.brand, item.requirement.description]
      .filter(Boolean)
      .join(" ");

    if (
      top &&
      !used.has(top.product.id) &&
      shouldAutoBindCatalogMatch(top, reqText)
    ) {
      used.add(top.product.id);
      lines.push({ productId: top.product.id, qty, aliasName, unit, unitPrice });
      continue;
    }

    // Keep the RFQ line unbound so the trader can pick from suggestions.
    lines.push({
      productId: null,
      qty,
      aliasName,
      unit,
      unitPrice,
      matchWeak: Boolean(top),
    });
  }

  if (lines.length === 0 && overall[0] && shouldAutoBindCatalogMatch(overall[0], rfq.subject || "")) {
    const specs = rfq.parsedSpecs as Record<string, unknown> | null;
    const defaultQty =
      typeof specs?.quantity === "number" && specs.quantity > 0 ? specs.quantity : 1;
    lines.push({ productId: overall[0].product.id, qty: defaultQty });
  }

  return lines;
}

export type ExtractedQuoteItem = {
  productName: string;
  model?: string;
  brand?: string;
  code?: string;
  extraNotes?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
};

/** Match extracted screenshot/document lines to catalog products and use last/offer price. */
export async function catalogLinesFromExtractedItems(items: ExtractedQuoteItem[]) {
  if (items.length === 0) return [];

  const products = await prisma.product.findMany({ where: { active: true } });
  const parsedSpecs = {
    items: items.map((item) => ({
      description: item.productName || item.code || "",
      productName: item.productName,
      model: item.model,
      brand: item.brand,
      code: item.code,
      extraNotes: item.extraNotes,
      quantity: item.quantity,
      unit: item.unit,
      ...(item.unitPrice != null && item.unitPrice > 0
        ? { unitPrice: item.unitPrice }
        : {}),
    })),
  };
  const rawText = items
    .map(
      (item) =>
        `• ${[item.productName, item.model].filter(Boolean).join(" ")} – ${
          item.quantity > 0 ? item.quantity : 1
        } ${item.unit || "pcs"}`
    )
    .join("\n");

  const itemMatches = matchProductsToRfqItems(products, { parsedSpecs, rawText });

  return items.map((item, i) => {
    const top = itemMatches[i]?.matches[0];
    const qty = item.quantity > 0 ? item.quantity : 1;
    const presented = quoteLinePresentation({
      clientName: item.productName,
      clientCode: item.code,
      clientBrand: item.brand,
      clientModel: item.model,
      clientUnit: item.unit,
      extraNotes: item.extraNotes,
      catalogName: top?.product.name || "From document",
      catalogDescription: top
        ? products.find((p) => p.id === top.product.id)?.description || ""
        : "",
      catalogUnit: top?.product.unit,
    });

    const sheetPrice =
      item.unitPrice != null && item.unitPrice > 0 ? item.unitPrice : 0;

    if (top && top.score >= 6) {
      const full = products.find((p) => p.id === top.product.id);
      const catalogPrice = full ? catalogSellPrice(full) : top.product.offerPrice;
      // Spreadsheet / document rate wins over catalog when present.
      const unitPrice = sheetPrice > 0 ? sheetPrice : catalogPrice;
      return {
        productId: top.product.id,
        description: presented.description,
        aliasName: presented.aliasName,
        qty,
        unit: presented.unit,
        unitPrice,
        taxRate: top.product.taxRate || 18,
      };
    }

    return {
      productId: null,
      description: presented.description,
      aliasName: presented.aliasName,
      qty,
      unit: presented.unit,
      unitPrice: sheetPrice,
      taxRate: 18,
    };
  });
}
