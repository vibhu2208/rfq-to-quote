import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  normalizeKeywords,
  normalizeVendorCategory,
  vendorInputSchema,
  type VendorInput,
} from "@/lib/vendor-schema";

type SourceRow = Record<string, unknown>;

export type VendorImportPreviewItem = VendorInput & {
  action: "create" | "update";
  existingVendorId: string | null;
};

export type VendorImportPreview = {
  items: VendorImportPreviewItem[];
  errors: Array<{ row: number; message: string }>;
  summary: {
    rows: number;
    groupedVendors: number;
    creates: number;
    updates: number;
  };
};

function pick(row: SourceRow, names: string[]): string {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (found && found[1] != null) return String(found[1]).trim();
  }
  return "";
}

export function parseVendorFile(buffer: Buffer, filename: string): SourceRow[] {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const parsed = Papa.parse<SourceRow>(buffer.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      throw new Error(parsed.errors[0].message);
    }
    return parsed.data;
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("Workbook has no sheets");
    return XLSX.utils.sheet_to_json<SourceRow>(firstSheet, { defval: "" });
  }
  throw new Error("Only CSV, XLSX, and XLS files are supported");
}

function identityKey(vendor: Pick<VendorInput, "name" | "phone" | "email">): string {
  if (vendor.phone) return `phone:${vendor.phone.toLowerCase()}`;
  if (vendor.email) return `email:${vendor.email.toLowerCase()}`;
  return `name:${vendor.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function rowToVendor(row: SourceRow): VendorInput {
  const preferredRaw = pick(row, ["preferredChannel", "preferred_channel", "channel"]);
  const preferredChannel = preferredRaw.toUpperCase() || "EMAIL";
  return {
    name: pick(row, ["name", "vendor", "vendor_name"]),
    phone: pick(row, ["phone", "mobile", "phone_number"]),
    email: pick(row, ["email", "email_address"]).toLowerCase(),
    whatsappId: pick(row, ["whatsappId", "whatsapp_id", "whatsapp"]),
    preferredChannel: preferredChannel as "EMAIL" | "WHATSAPP",
    active: true,
    categories: [
      {
        category: normalizeVendorCategory(
          pick(row, ["category", "product_category", "vertical"])
        ),
        subcategory: pick(row, ["subcategory", "sub_category"]),
        keywords: normalizeKeywords(pick(row, ["keywords", "keyword", "tags"])),
      },
    ],
  };
}

function mergeRows(rows: SourceRow[]) {
  const grouped = new Map<string, VendorInput & { sourceRows: number[] }>();
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const candidate = rowToVendor(row);
    const parsed = vendorInputSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      return;
    }

    const key = identityKey(parsed.data);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...parsed.data, sourceRows: [rowNumber] });
      return;
    }

    existing.sourceRows.push(rowNumber);
    existing.phone ||= parsed.data.phone;
    existing.email ||= parsed.data.email;
    existing.whatsappId ||= parsed.data.whatsappId;
    if (parsed.data.preferredChannel === "WHATSAPP") {
      existing.preferredChannel = "WHATSAPP";
    }

    for (const category of parsed.data.categories) {
      const same = existing.categories.find(
        (current) =>
          current.category.toLowerCase() === category.category.toLowerCase() &&
          current.subcategory.toLowerCase() === category.subcategory.toLowerCase()
      );
      if (same) {
        same.keywords = [...new Set([...same.keywords, ...category.keywords])];
      } else {
        existing.categories.push(category);
      }
    }
  });

  return { vendors: [...grouped.values()], errors };
}

export async function buildVendorImportPreview(
  rows: SourceRow[]
): Promise<VendorImportPreview> {
  const { vendors, errors } = mergeRows(rows);
  const existing = await prisma.vendor.findMany({
    select: { id: true, name: true, phone: true, email: true },
  });

  const items = vendors.map<VendorImportPreviewItem>((vendor) => {
    const match = existing.find((current) => {
      if (vendor.phone && current.phone === vendor.phone) return true;
      if (
        vendor.email &&
        current.email?.toLowerCase() === vendor.email.toLowerCase()
      ) {
        return true;
      }
      return (
        !vendor.phone &&
        !vendor.email &&
        current.name.trim().toLowerCase() === vendor.name.trim().toLowerCase()
      );
    });
    const data: VendorInput = {
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      whatsappId: vendor.whatsappId,
      preferredChannel: vendor.preferredChannel,
      active: vendor.active,
      categories: vendor.categories,
    };
    return {
      ...data,
      action: match ? "update" : "create",
      existingVendorId: match?.id || null,
    };
  });

  return {
    items,
    errors,
    summary: {
      rows: rows.length,
      groupedVendors: items.length,
      creates: items.filter((item) => item.action === "create").length,
      updates: items.filter((item) => item.action === "update").length,
    },
  };
}

export async function commitVendorImport(items: VendorImportPreviewItem[]) {
  const validated = items.map((item) => {
    const parsed = vendorInputSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(
        `${item.name}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
      );
    }
    return { ...item, data: parsed.data };
  });

  return prisma.$transaction(async (transaction) => {
    let created = 0;
    let updated = 0;

    for (const item of validated) {
      const vendorData = {
        name: item.data.name,
        phone: item.data.phone || null,
        email: item.data.email || null,
        whatsappId: item.data.whatsappId || null,
        preferredChannel: item.data.preferredChannel,
        active: item.data.active,
      };

      let vendorId = item.existingVendorId;
      if (vendorId) {
        await transaction.vendor.update({
          where: { id: vendorId },
          data: vendorData,
        });
        updated += 1;
      } else {
        const vendor = await transaction.vendor.create({ data: vendorData });
        vendorId = vendor.id;
        created += 1;
      }

      for (const category of item.data.categories) {
        await transaction.vendorCategory.upsert({
          where: {
            vendorId_category_subcategory: {
              vendorId,
              category: category.category,
              subcategory: category.subcategory,
            },
          },
          update: { keywords: category.keywords },
          create: {
            vendorId,
            category: category.category,
            subcategory: category.subcategory,
            keywords: category.keywords,
          },
        });
      }
    }

    return { created, updated, total: validated.length };
  });
}
