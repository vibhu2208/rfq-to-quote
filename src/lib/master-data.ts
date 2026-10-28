export type MasterField = { key: string; label: string; value: string };
export type MasterGroup = { title: string; fields: MasterField[] };

const CLIENT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Identity",
    keys: [
      "ClientID",
      "ClientName",
      "ClientAccName",
      "ClientTypeName",
      "ClientType",
      "PrefixName",
      "StatusName",
      "Gender",
      "PhotoPath",
    ],
  },
  {
    title: "Tax & statutory",
    keys: ["GSTIN", "ClientPAN", "ClientTIN", "ClientSTNo", "AdharNo", "StateCode"],
  },
  {
    title: "Address",
    keys: [
      "ClientAddress",
      "CityName",
      "ClientCity",
      "ClientPinCode",
      "StateName",
      "ClientState",
      "CountryName",
      "ClientCountry",
    ],
  },
  {
    title: "Contact",
    keys: ["ClientPhone1", "ClientPhone2", "ClientFax", "ClientEmail", "ClientWeb"],
  },
  {
    title: "Ledger",
    keys: [
      "LedgerCode",
      "LedgerGroupName",
      "PrimaryGroupName",
      "GroupNatureName",
      "OpBal",
      "DRCR",
      "UserName",
      "ManageName",
      "ManagedBy",
      "ClientRemarks",
    ],
  },
  {
    title: "Bank",
    keys: [
      "BankName",
      "BranchName",
      "ClientIFSCCode",
      "ClientAccNo",
      "AccTypeName",
      "MICRCode",
      "ClientAccName",
    ],
  },
  {
    title: "Flags",
    keys: [
      "IsVendor",
      "IsCash",
      "IsBank",
      "IsTaxType",
      "IsFeeType",
      "IsEmpType",
      "IsStock",
      "IsProfitLossAc",
      "IsTradingAc",
      "IsDeductionType",
    ],
  },
];

const PRODUCT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Identity",
    keys: ["ProductID", "ProductName", "ModelNo", "PartNo", "CommCode", "PopularCode", "Brand"],
  },
  {
    title: "Classification",
    keys: ["LeadCatName", "SubCatName", "ProductTypeName", "Gender"],
  },
  {
    title: "Pricing & tax",
    keys: ["Cost", "MRP", "GSTTaxName", "HSN_SCA"],
  },
  {
    title: "Stock",
    keys: ["OpStock", "UnitName", "IsStockable", "BatchNo"],
  },
  {
    title: "Specs",
    keys: ["Specs", "PhotoPath"],
  },
];

export function humanizeMasterKey(key: string): string {
  const special: Record<string, string> = {
    GSTIN: "GSTIN",
    HSN_SCA: "HSN / SAC",
    MRP: "MRP",
    ClientID: "Client ID",
    ProductID: "Product ID",
    PAN: "PAN",
    IFSC: "IFSC",
    MICRCode: "MICR code",
    OpBal: "Opening balance",
    OpStock: "Opening stock",
    DRCR: "Dr/Cr",
    AdharNo: "Aadhaar",
    GSTTaxName: "GST",
    LeadCatName: "Category",
    SubCatName: "Sub-category",
    ClientTypeName: "Client type",
    ClientType: "Client type ID",
    ProductTypeName: "Product type",
  };
  if (special[key]) return special[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bId\b/g, "ID")
    .replace(/\bGstin\b/g, "GSTIN")
    .trim();
}

export function formatMasterValue(key: string, raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  const text = String(raw).trim();
  if (!text) return "";
  if (/^is[A-Z]/.test(key) || key.startsWith("Is")) {
    const lower = text.toLowerCase();
    if (lower === "1" || lower === "true" || lower === "yes" || lower === "y") return "Yes";
    if (lower === "0" || lower === "false" || lower === "no" || lower === "n") return "No";
  }
  return text;
}

function asRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

export function groupMasterData(
  data: unknown,
  kind: "client" | "product",
  showEmpty = false
): MasterGroup[] {
  const record = asRecord(data);
  const definitions = kind === "client" ? CLIENT_GROUPS : PRODUCT_GROUPS;
  const used = new Set<string>();
  const groups: MasterGroup[] = [];

  for (const def of definitions) {
    const fields: MasterField[] = [];
    for (const key of def.keys) {
      if (used.has(key)) continue;
      if (!(key in record) && !showEmpty) continue;
      used.add(key);
      const value = formatMasterValue(key, record[key]);
      if (!showEmpty && !value) continue;
      fields.push({ key, label: humanizeMasterKey(key), value: value || "—" });
    }
    if (fields.length) groups.push({ title: def.title, fields });
  }

  const other: MasterField[] = [];
  for (const key of Object.keys(record)) {
    if (used.has(key)) continue;
    const value = formatMasterValue(key, record[key]);
    if (!showEmpty && !value) continue;
    other.push({ key, label: humanizeMasterKey(key), value: value || "—" });
  }
  if (other.length) groups.push({ title: "Other", fields: other });

  return groups;
}
