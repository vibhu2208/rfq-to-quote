export type ImportRow = Record<string, string>;

export function pickMappedColumn(row: ImportRow, column?: string | null) {
  if (!column) return "";
  const target = column.trim().toLowerCase();
  const found = Object.entries(row).find(
    ([k]) => k.trim().toLowerCase() === target
  );
  return found?.[1]?.trim() || "";
}

export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return digits;
}

export type ParsedContactRow = {
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
};

export function mapRowToContact(
  row: ImportRow,
  mapping: {
    name?: string;
    company?: string;
    role?: string;
    phone?: string;
    email?: string;
  }
): { ok: true; contact: ParsedContactRow } | { ok: false; error: string } {
  const phone = normalizePhone(pickMappedColumn(row, mapping.phone));
  const email = pickMappedColumn(row, mapping.email).toLowerCase();
  const name = pickMappedColumn(row, mapping.name);
  const company = pickMappedColumn(row, mapping.company);
  const role = pickMappedColumn(row, mapping.role);

  if (!phone && !email) {
    return { ok: false, error: "Each row needs phone or email" };
  }
  if (mapping.phone && pickMappedColumn(row, mapping.phone) && !phone) {
    return { ok: false, error: "Invalid phone (7–15 digits)" };
  }

  return {
    ok: true,
    contact: { name, company, role, phone, email },
  };
}