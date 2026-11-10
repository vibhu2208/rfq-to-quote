import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizeStoredRfqCategories } from "@/lib/categories";
import { matchVendorsToRfq, type VendorMatch } from "@/lib/vendor-match";
import { getOutreachMapForRfq } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contactsFromVendor(vendor: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsappId: string | null;
  contacts: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isPrimary: boolean;
    vendorCategoryId: string | null;
  }>;
}): VendorMatch["vendor"]["contacts"] {
  const mapped =
    vendor.contacts.length > 0
      ? vendor.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name || "",
          email: contact.email || "",
          phone: contact.phone || "",
          role: contact.role || "",
          isPrimary: contact.isPrimary,
          vendorCategoryId: contact.vendorCategoryId,
        }))
      : [];

  const vendorWa = (vendor.whatsappId || vendor.phone || "").trim();
  const hasPhone = mapped.some((contact) => Boolean(contact.phone));
  if (vendorWa && !hasPhone) {
    mapped.push({
      id: `vendor-${vendor.id}-wa`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "WhatsApp",
      isPrimary: mapped.length === 0,
      vendorCategoryId: null,
    });
  } else if (mapped.length === 0 && (vendor.email || vendorWa)) {
    mapped.push({
      id: `vendor-${vendor.id}`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "",
      isPrimary: true,
      vendorCategoryId: null,
    });
  }
  return mapped;
}

/** Deterministic vendor matching from parsed RFQ fields — no AI call. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  }

  const normalized = normalizeStoredRfqCategories({
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
  });

  const result = await matchVendorsToRfq({
    parsedCategory: normalized.parsedCategory || rfq.parsedCategory,
    parsedSpecs: normalized.parsedSpecs || rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  });

  const outreaches = await getOutreachMapForRfq(id);
  const matchedIds = new Set(result.matches.map((match) => match.vendor.id));
  const matches = result.matches.map((match) => ({
    ...match,
    outreach: outreaches.get(match.vendor.id) || null,
  }));

  // Keep vendors that were already contacted even if category rematch drops them.
  const missingOutreachVendorIds = [...outreaches.keys()].filter(
    (vendorId) => !matchedIds.has(vendorId)
  );
  if (missingOutreachVendorIds.length > 0) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: missingOutreachVendorIds } },
      include: {
        categories: { orderBy: [{ category: "asc" }, { subcategory: "asc" }] },
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      },
    });
    for (const vendor of vendors) {
      const outreach = outreaches.get(vendor.id);
      const categoryRow = vendor.categories[0];
      const quotedLines = outreach?.quotedLineItems || [];
      matches.push({
        vendor: {
          id: vendor.id,
          name: vendor.name,
          phone: vendor.phone || "",
          email: vendor.email || "",
          whatsappId: vendor.whatsappId || "",
          preferredChannel: vendor.preferredChannel,
          contacts: contactsFromVendor(vendor),
        },
        category: categoryRow?.category || "Contacted",
        subcategory: categoryRow?.subcategory || "",
        matchedKeywords: [],
        score: 0,
        productKey: result.productKey,
        lastPrice:
          outreach?.quotedTotal ??
          outreach?.quotedPrice ??
          (quotedLines.length === 1 ? quotedLines[0].unitPrice : null),
        lastQuotedAt: outreach?.repliedAt || outreach?.sentAt || null,
        matchedLines: quotedLines.map((line) => ({
          lineNumber: line.lineNumber,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          productKey: result.productKey,
        })),
        estimatedTotal:
          outreach?.quotedTotal ??
          (quotedLines.length > 0
            ? quotedLines.reduce((sum, line) => sum + line.lineTotal, 0)
            : outreach?.quotedPrice != null
              ? Number(outreach.quotedPrice)
              : null),
        outreach,
      });
    }
  }

  return NextResponse.json({ ...result, matches });
}
