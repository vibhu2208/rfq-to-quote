import "dotenv/config";
import path from "node:path";
import { Prisma, type PartyType, type UqcCode } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";
import { getDefaultOrgContext } from "../src/lib/accounting/context";
import { GST_STATE_CODES, getStateCode } from "../src/lib/accounting/states";
import { syncGoodsProductsToWarehouse } from "../src/lib/accounting/inventory";

const DEFAULT_FILE = path.join(
  process.cwd(),
  "public",
  "ClientMaster_ProductMaster_Export_2026-10-26.xlsx"
);

const UQC_SET = new Set<UqcCode>([
  "BAG",
  "BAL",
  "BDL",
  "BKL",
  "BOU",
  "BOX",
  "BTL",
  "BUN",
  "CAN",
  "CBM",
  "CCM",
  "CMS",
  "CTN",
  "DOZ",
  "DRM",
  "GGR",
  "GMS",
  "GRS",
  "GYD",
  "KGS",
  "KLR",
  "KME",
  "LTR",
  "MLT",
  "MTR",
  "MTS",
  "NOS",
  "PAC",
  "PCS",
  "PRS",
  "QTL",
  "ROL",
  "SET",
  "SQF",
  "SQM",
  "SQY",
  "TBS",
  "TGM",
  "THD",
  "TON",
  "TUB",
  "UGS",
  "UNT",
  "YDS",
  "OTH",
]);

type Row = Record<string, unknown>;

function cell(row: Row, key: string): string {
  const value = row[key];
  if (value == null) return "";
  return String(value).trim();
}

function num(row: Row, key: string): number {
  const raw = cell(row, key).replace(/,/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function truthy(row: Row, key: string): boolean {
  const v = cell(row, key).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function toUqc(unit: string): UqcCode {
  const u = unit.trim().toUpperCase();
  if (u === "NO" || u === "NOS." || u === "NUMBER" || u === "NUMBERS") return "NOS";
  if (u === "PC" || u === "PCS." || u === "PIECE" || u === "PIECES") return "PCS";
  if (UQC_SET.has(u as UqcCode)) return u as UqcCode;
  return "NOS";
}

function parseGst(name: string): { rate: number; category: string } {
  const match = name.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const rate = Number(match[1]);
    return { rate, category: `GST${rate}` };
  }
  const lower = name.toLowerCase();
  if (lower.includes("exempt") || lower.includes("nil") || lower.includes("0")) {
    return { rate: 0, category: "GST0" };
  }
  return { rate: 18, category: "GST18" };
}

function padStateCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(2, "0").slice(-2);
}

function partyTypeFor(row: Row): PartyType {
  if (truthy(row, "IsEmpType")) return "EMPLOYEE";
  if (truthy(row, "IsCash") || truthy(row, "IsBank") || truthy(row, "IsTaxType")) return "OTHER";
  const group = cell(row, "LedgerGroupName").toLowerCase();
  if (group.includes("creditor")) return "VENDOR";
  if (group.includes("debtor")) return "CUSTOMER";
  return "CUSTOMER";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function clearCurrentCatalog(organisationId: string) {
  const products = await prisma.product.findMany({ select: { id: true } });
  const productIds = products.map((p) => p.id);

  await prisma.quoteLineItem.updateMany({ data: { productId: null } });
  await prisma.invoiceLine.updateMany({ data: { productId: null } });
  await prisma.proformaInvoiceLine.updateMany({ data: { productId: null } });
  await prisma.creditDebitNoteLine.updateMany({ data: { productId: null } });
  await prisma.transactionDraftLine.updateMany({ data: { productId: null } });

  if (productIds.length) {
    await prisma.inventoryValuationLayer.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.stockBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.stockMovement.updateMany({
      where: { productId: { in: productIds } },
      data: { reversedById: null, invoiceId: null },
    });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
  }

  const deletedProducts = await prisma.product.deleteMany();

  await prisma.address.deleteMany({
    where: { party: { organisationId } },
  });

  const linked = await prisma.party.findMany({
    where: { organisationId },
    select: {
      id: true,
      _count: { select: { invoices: true, proformaInvoices: true, creditDebitNotes: true } },
    },
  });
  const blocked = linked.filter(
    (p) =>
      p._count.invoices > 0 || p._count.proformaInvoices > 0 || p._count.creditDebitNotes > 0
  );
  const removable = linked.filter(
    (p) =>
      p._count.invoices === 0 &&
      p._count.proformaInvoices === 0 &&
      p._count.creditDebitNotes === 0
  );

  await prisma.payment.updateMany({
    where: { partyId: { in: removable.map((p) => p.id) } },
    data: { partyId: null },
  });
  await prisma.journalLine.updateMany({
    where: { partyId: { in: removable.map((p) => p.id) } },
    data: { partyId: null },
  });
  await prisma.transactionDraft.updateMany({
    where: { partyId: { in: removable.map((p) => p.id) } },
    data: { partyId: null },
  });

  const deletedParties = await prisma.party.deleteMany({
    where: { id: { in: removable.map((p) => p.id) } },
  });

  return {
    deletedProducts: deletedProducts.count,
    deletedParties: deletedParties.count,
    keptParties: blocked.length,
  };
}

function productRecords(rows: Row[], organisationId: string): Prisma.ProductCreateManyInput[] {
  const seen = new Set<string>();
  const out: Prisma.ProductCreateManyInput[] = [];

  for (const row of rows) {
    const sourceProductId = cell(row, "ProductID");
    const name = cell(row, "ProductName");
    if (!sourceProductId || !name) continue;
    if (seen.has(sourceProductId)) continue;
    seen.add(sourceProductId);

    const unitName = cell(row, "UnitName") || "NOS";
    const gst = parseGst(cell(row, "GSTTaxName"));
    const cost = num(row, "Cost");
    const mrp = num(row, "MRP");
    const typeName = cell(row, "ProductTypeName").toLowerCase();
    const productType = typeName.includes("service") ? "SERVICE" : "GOODS";

    out.push({
      sourceProductId,
      code: sourceProductId,
      name,
      description: cell(row, "Specs"),
      unit: unitName.toLowerCase() === "nos" ? "nos" : unitName.toLowerCase() || "pcs",
      uqc: toUqc(unitName),
      hsnCode: cell(row, "HSN_SCA") || null,
      productType,
      organisationId,
      basePrice: new Prisma.Decimal(cost),
      offerPrice: new Prisma.Decimal(mrp > 0 ? mrp : cost),
      taxRate: new Prisma.Decimal(gst.rate),
      taxCategory: gst.category,
      modelNo: cell(row, "ModelNo") || null,
      partNo: cell(row, "PartNo") || null,
      commCode: cell(row, "CommCode") || null,
      category: cell(row, "LeadCatName") || null,
      subCategory: cell(row, "SubCatName") || null,
      brand: cell(row, "Brand") || null,
      batchNo: cell(row, "BatchNo") || null,
      popularCode: cell(row, "PopularCode") || null,
      photoPath: cell(row, "PhotoPath") || null,
      gstTaxName: cell(row, "GSTTaxName") || null,
      mrp: mrp > 0 ? new Prisma.Decimal(mrp) : null,
      openingStock: new Prisma.Decimal(num(row, "OpStock")),
      isStockable: cell(row, "IsStockable") === "" ? true : truthy(row, "IsStockable"),
      sourceGender: cell(row, "Gender") || null,
      masterData: row as Prisma.InputJsonValue,
      active: true,
    });
  }
  return out;
}

function clientRecords(
  rows: Row[],
  organisationId: string
): {
  parties: Prisma.PartyCreateManyInput[];
  addresses: Array<{ sourceClientId: string; data: Omit<Prisma.AddressCreateManyInput, "partyId"> }>;
} {
  const seen = new Set<string>();
  const parties: Prisma.PartyCreateManyInput[] = [];
  const addresses: Array<{
    sourceClientId: string;
    data: Omit<Prisma.AddressCreateManyInput, "partyId">;
  }> = [];

  for (const row of rows) {
    const sourceClientId = cell(row, "ClientID");
    const legalName = cell(row, "ClientName");
    if (!sourceClientId || !legalName) continue;
    if (seen.has(sourceClientId)) continue;
    seen.add(sourceClientId);

    const gstin = cell(row, "GSTIN").toUpperCase();
    const stateName = cell(row, "StateName");
    const stateCode =
      padStateCode(cell(row, "StateCode")) || getStateCode(stateName) || "";
    const resolvedState =
      stateName || (stateCode ? GST_STATE_CODES[stateCode] : "") || "";
    const city = cell(row, "CityName");
    const addressLine1 = cell(row, "ClientAddress") || city || legalName;
    const phone = cell(row, "ClientPhone1") || cell(row, "ClientPhone2");

    parties.push({
      organisationId,
      sourceClientId,
      code: sourceClientId,
      type: partyTypeFor(row),
      legalName,
      tradeName: cell(row, "ClientAccName") || null,
      gstin: gstin.length === 15 ? gstin : gstin || null,
      pan: cell(row, "ClientPAN") || null,
      tin: cell(row, "ClientTIN") || null,
      stNumber: cell(row, "ClientSTNo") || null,
      email: cell(row, "ClientEmail").toLowerCase() || null,
      phone: phone || null,
      phone2: cell(row, "ClientPhone2") || null,
      fax: cell(row, "ClientFax") || null,
      website: cell(row, "ClientWeb") || null,
      placeOfSupplyCode: stateCode || null,
      gstinStatus: gstin.length === 15 ? "Imported" : null,
      openingBalance: new Prisma.Decimal(num(row, "OpBal")),
      openingDrCr: cell(row, "DRCR") || null,
      clientTypeName: cell(row, "ClientTypeName") || null,
      ledgerGroup: cell(row, "LedgerGroupName") || null,
      ledgerCode: cell(row, "LedgerCode") || null,
      primaryGroup: cell(row, "PrimaryGroupName") || null,
      remarks: cell(row, "ClientRemarks") || null,
      bankName: cell(row, "BankName") || null,
      bankIfsc: cell(row, "ClientIFSCCode") || null,
      bankAccountNo: cell(row, "ClientAccNo") || null,
      bankAccountName: cell(row, "ClientAccName") || null,
      bankAccountType: cell(row, "AccTypeName") || null,
      bankBranch: cell(row, "BranchName") || null,
      micrCode: cell(row, "MICRCode") || null,
      aadhaar: cell(row, "AdharNo") || null,
      managedByName: cell(row, "ManageName") || null,
      isVendor: truthy(row, "IsVendor"),
      masterData: row as Prisma.InputJsonValue,
      active: true,
    });

    addresses.push({
      sourceClientId,
      data: {
        type: "BILLING",
        label: "Registered",
        addressLine1: addressLine1.slice(0, 500) || "—",
        addressLine2: null,
        city: city || resolvedState || "—",
        district: null,
        state: resolvedState || city || "—",
        stateCode: stateCode || "99",
        postalCode: cell(row, "ClientPinCode") || "",
        countryCode: cell(row, "CountryName").toLowerCase().includes("india") || !cell(row, "CountryName")
          ? "IN"
          : "IN",
        isDefault: true,
      },
    });
  }

  return { parties, addresses };
}

async function main() {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || DEFAULT_FILE;
  console.log(`Reading ${file}`);
  const workbook = XLSX.readFile(file);
  const productRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets.ProductMaster || {}, {
    defval: null,
    raw: false,
  });
  const clientRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets.ClientMaster || {}, {
    defval: null,
    raw: false,
  });
  console.log(`Excel rows: products=${productRows.length} clients=${clientRows.length}`);

  const ctx = await getDefaultOrgContext();
  const clientsOnly = process.argv.includes("--clients-only");
  const skipClear = process.argv.includes("--skip-clear") || clientsOnly;

  if (!skipClear) {
    const cleared = await clearCurrentCatalog(ctx.organisationId);
    console.log(
      `Cleared existing catalog: products=${cleared.deletedProducts} parties=${cleared.deletedParties} kept(with invoices)=${cleared.keptParties}`
    );
  } else {
    await prisma.address.deleteMany({
      where: { party: { organisationId: ctx.organisationId, sourceClientId: { not: null } } },
    });
    const imported = await prisma.party.findMany({
      where: { organisationId: ctx.organisationId, sourceClientId: { not: null } },
      select: {
        id: true,
        _count: { select: { invoices: true, proformaInvoices: true, creditDebitNotes: true } },
      },
    });
    const removable = imported.filter(
      (p) =>
        p._count.invoices === 0 &&
        p._count.proformaInvoices === 0 &&
        p._count.creditDebitNotes === 0
    );
    await prisma.party.deleteMany({ where: { id: { in: removable.map((p) => p.id) } } });
    console.log(`Removed previously imported parties: ${removable.length}`);
  }

  if (!clientsOnly) {
    const existingMaster = await prisma.product.count({ where: { sourceProductId: { not: null } } });
    if (existingMaster > 0 && skipClear) {
      console.log(`Keeping ${existingMaster} already-imported products`);
    } else {
      const products = productRecords(productRows, ctx.organisationId);
      for (const part of chunk(products, 200)) {
        await prisma.product.createMany({ data: part });
      }
      console.log(`Imported products: ${products.length}`);
    }

    const stockSync = await syncGoodsProductsToWarehouse(prisma, {
      warehouseId: ctx.warehouseId,
      organisationId: ctx.organisationId,
    });
    console.log(
      `Warehouse stock rows: created=${stockSync.created} goods=${stockSync.totalGoods}`
    );
  }

  const { parties, addresses } = clientRecords(clientRows, ctx.organisationId);
  for (const part of chunk(parties, 200)) {
    await prisma.party.createMany({ data: part });
  }
  console.log(`Imported parties: ${parties.length}`);

  const partyIds = await prisma.party.findMany({
    where: { organisationId: ctx.organisationId, sourceClientId: { not: null } },
    select: { id: true, sourceClientId: true },
  });
  const idBySource = new Map(
    partyIds.map((p) => [p.sourceClientId as string, p.id] as const)
  );
  const addressRows: Prisma.AddressCreateManyInput[] = [];
  for (const item of addresses) {
    const partyId = idBySource.get(item.sourceClientId);
    if (!partyId) continue;
    addressRows.push({ ...item.data, partyId });
  }
  for (const part of chunk(addressRows, 200)) {
    await prisma.address.createMany({ data: part });
  }
  console.log(`Imported billing addresses: ${addressRows.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
