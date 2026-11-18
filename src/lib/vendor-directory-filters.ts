export type VendorDirectoryFilterInput = {
  mapped?: string | null;
  poc?: string | null;
};

/** Extra Prisma where clauses for the By vendor directory. Unknown values are ignored. */
export function vendorDirectoryFilters(
  input: VendorDirectoryFilterInput
): Array<Record<string, unknown>> {
  const filters: Array<Record<string, unknown>> = [];
  if (input.mapped === "yes") filters.push({ categories: { some: {} } });
  if (input.mapped === "no") filters.push({ categories: { none: {} } });
  if (input.poc === "yes") filters.push({ contacts: { some: {} } });
  if (input.poc === "no") filters.push({ contacts: { none: {} } });
  return filters;
}
