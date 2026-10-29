import { CLIENT_GROUPS, formatMasterValue, humanizeMasterKey } from "@/lib/master-data";

export type OnboardContact = {
  name: string;
  designation: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

export type OnboardValues = {
  fields: Record<string, string>;
  contacts: OnboardContact[];
};

export const CLIENT_FLAGS: { key: string; label: string; hint: string }[] = [
  { key: "IsVendor", label: "Also a vendor", hint: "We buy from this party as well as sell to them." },
  { key: "IsCash", label: "Cash account", hint: "Cash ledger, not a trading customer." },
  { key: "IsBank", label: "Bank account", hint: "Bank ledger used in receipts and payments." },
  { key: "IsTaxType", label: "Tax ledger", hint: "GST or other tax account." },
  { key: "IsFeeType", label: "Fee ledger", hint: "Fee or charges account." },
  { key: "IsEmpType", label: "Employee", hint: "Staff record rather than a customer." },
  { key: "IsStock", label: "Stock account", hint: "Inventory or stock ledger." },
  { key: "IsProfitLossAc", label: "P&L account", hint: "Profit and loss ledger." },
  { key: "IsTradingAc", label: "Trading account", hint: "Trading / purchase-sales ledger." },
  { key: "IsDeductionType", label: "Deduction", hint: "Deduction or withholding ledger." },
];

const FLAG_HELP = Object.fromEntries(CLIENT_FLAGS.map((f) => [f.key, f]));

export type GstOnboardPreview = {
  legalName?: string;
  tradeName?: string;
  status?: string;
  stateName?: string;
  stateCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  gstin?: string;
};

export type PartyOnboardPayload = {
  sourceClientId: string | null;
  legalName: string;
  tradeName: string | null;
  clientTypeName: string | null;
  gstin: string | null;
  pan: string | null;
  tin: string | null;
  stNumber: string | null;
  aadhaar: string | null;
  placeOfSupplyCode: string | null;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  fax: string | null;
  website: string | null;
  ledgerCode: string | null;
  ledgerGroup: string | null;
  primaryGroup: string | null;
  openingBalance: string;
  openingDrCr: string | null;
  managedByName: string | null;
  remarks: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankIfsc: string | null;
  bankAccountNo: string | null;
  bankAccountType: string | null;
  bankAccountName: string | null;
  micrCode: string | null;
  isVendor: boolean;
  address: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    district: string | null;
    state: string;
    stateCode: string;
    postalCode: string;
    countryCode: string;
  } | null;
  masterData: Record<string, unknown>;
  contacts: OnboardContact[];
};

const FLAG_KEYS = new Set(
  CLIENT_GROUPS.find((g) => g.title === "Flags")?.keys ?? []
);

function blank(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function nullIfEmpty(value: string | undefined | null): string | null {
  const t = blank(value);
  return t ? t : null;
}

export function uniqueClientMasterKeys(): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const group of CLIENT_GROUPS) {
    for (const key of group.keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

export function emptyOnboardValues(): OnboardValues {
  const fields: Record<string, string> = {};
  for (const key of uniqueClientMasterKeys()) {
    fields[key] = "";
  }
  fields.CountryName = fields.CountryName || "India";
  fields.ClientCountry = fields.ClientCountry || "India";
  return { fields, contacts: [emptyOnboardContact(true)] };
}

export function emptyOnboardContact(isPrimary = false): OnboardContact {
  return { name: "", designation: "", email: "", phone: "", isPrimary };
}

export function normalizeOnboardContacts(contacts: OnboardContact[]): OnboardContact[] {
  const rows = contacts.filter((c) => blank(c.name) || blank(c.email) || blank(c.phone));
  if (rows.length === 0) return [];
  const primaryIndex = rows.findIndex((c) => c.isPrimary);
  return rows.map((c, i) => ({
    name: blank(c.name),
    designation: blank(c.designation),
    email: blank(c.email),
    phone: blank(c.phone),
    isPrimary: primaryIndex >= 0 ? i === primaryIndex : i === 0,
  }));
}

export function onboardFieldKind(key: string): "gstin" | "textarea" | "checkbox" | "text" {
  if (key === "GSTIN") return "gstin";
  if (key === "ClientRemarks" || key === "ClientAddress") return "textarea";
  if (FLAG_KEYS.has(key) || key.startsWith("Is")) return "checkbox";
  return "text";
}

export function onboardFieldLabel(key: string): string {
  return FLAG_HELP[key]?.label || humanizeMasterKey(key);
}

export function onboardFlagHint(key: string): string {
  return FLAG_HELP[key]?.hint || "";
}

export function isFlagOn(value: string | undefined): boolean {
  const text = formatMasterValue("IsVendor", value || "");
  return text === "Yes";
}

export function applyGstinPreview(
  current: OnboardValues,
  preview: GstOnboardPreview
): OnboardValues {
  const fields = { ...current.fields };
  const set = (key: string, value?: string | null) => {
    const next = blank(value);
    if (next) fields[key] = next;
  };
  set("GSTIN", preview.gstin);
  set("ClientName", preview.legalName);
  set("ClientAccName", preview.tradeName);
  set("StatusName", preview.status);
  set("StateName", preview.stateName || preview.state);
  set("ClientState", preview.state || preview.stateName);
  set("StateCode", preview.stateCode);
  set("ClientAddress", [preview.addressLine1, preview.addressLine2].filter(Boolean).join(", "));
  set("CityName", preview.city);
  set("ClientCity", preview.city);
  set("ClientPinCode", preview.postalCode);
  return { ...current, fields };
}

export function formToMasterData(values: OnboardValues): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of uniqueClientMasterKeys()) {
    const raw = values.fields[key] ?? "";
    if (onboardFieldKind(key) === "checkbox") {
      if (isFlagOn(raw)) data[key] = "Yes";
      continue;
    }
    const text = blank(raw);
    if (text) data[key] = text;
  }
  return data;
}

export function formToPartyPayload(values: OnboardValues): PartyOnboardPayload {
  const f = values.fields;
  const contacts = normalizeOnboardContacts(values.contacts);
  const primary = contacts.find((c) => c.isPrimary) || contacts[0];
  const gstin = blank(f.GSTIN).toUpperCase();
  const stateCode = blank(f.StateCode) || (gstin.length === 15 ? gstin.slice(0, 2) : "");
  const addressLine1 = blank(f.ClientAddress);
  const city = blank(f.CityName) || blank(f.ClientCity);
  const state = blank(f.StateName) || blank(f.ClientState);
  const postalCode = blank(f.ClientPinCode);
  const country = blank(f.CountryName) || blank(f.ClientCountry) || "India";
  const hasAddress = Boolean(addressLine1 || city || state || postalCode);

  return {
    sourceClientId: nullIfEmpty(f.ClientID),
    legalName: blank(f.ClientName),
    tradeName: nullIfEmpty(f.ClientAccName),
    clientTypeName: nullIfEmpty(f.ClientTypeName),
    gstin: gstin.length === 15 ? gstin : nullIfEmpty(gstin),
    pan: nullIfEmpty(f.ClientPAN),
    tin: nullIfEmpty(f.ClientTIN),
    stNumber: nullIfEmpty(f.ClientSTNo),
    aadhaar: nullIfEmpty(f.AdharNo),
    placeOfSupplyCode: nullIfEmpty(stateCode),
    email: nullIfEmpty(f.ClientEmail) || nullIfEmpty(primary?.email),
    phone: nullIfEmpty(f.ClientPhone1) || nullIfEmpty(primary?.phone),
    phone2: nullIfEmpty(f.ClientPhone2),
    fax: nullIfEmpty(f.ClientFax),
    website: nullIfEmpty(f.ClientWeb),
    ledgerCode: nullIfEmpty(f.LedgerCode),
    ledgerGroup: nullIfEmpty(f.LedgerGroupName),
    primaryGroup: nullIfEmpty(f.PrimaryGroupName),
    openingBalance: blank(f.OpBal) || "0",
    openingDrCr: nullIfEmpty(f.DRCR),
    managedByName:
      nullIfEmpty(primary?.name) || nullIfEmpty(f.ManageName) || nullIfEmpty(f.ManagedBy),
    remarks: nullIfEmpty(f.ClientRemarks),
    bankName: nullIfEmpty(f.BankName),
    bankBranch: nullIfEmpty(f.BranchName),
    bankIfsc: nullIfEmpty(f.ClientIFSCCode),
    bankAccountNo: nullIfEmpty(f.ClientAccNo),
    bankAccountType: nullIfEmpty(f.AccTypeName),
    bankAccountName: nullIfEmpty(f.ClientAccName),
    micrCode: nullIfEmpty(f.MICRCode),
    isVendor: isFlagOn(f.IsVendor),
    address: hasAddress
      ? {
          addressLine1: addressLine1 || city || "Address",
          addressLine2: null,
          city,
          district: null,
          state,
          stateCode,
          postalCode,
          countryCode: country.toLowerCase().startsWith("ind") ? "IN" : country.slice(0, 2).toUpperCase() || "IN",
        }
      : null,
    masterData: formToMasterData(values),
    contacts,
  };
}
