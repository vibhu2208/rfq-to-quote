import { quoteLinePresentation } from "@/lib/quote-line-alias";

export type CatalogProductDraft = {
  name: string;
  code: string;
  unit: string;
  brand: string;
  modelNo: string;
  partNo: string;
  category: string;
  hsnCode: string;
  description: string;
  productType: "GOODS" | "SERVICE";
  basePrice: number;
  offerPrice: number;
  taxRate: number;
  taxCategory: string;
  openingQty: number;
  openingUnitCost: number;
  active: boolean;
};

export type CatalogRequirementInput = {
  description: string;
  unit?: string | null;
  brand?: string | null;
  model?: string | null;
  code?: string | null;
  extraNotes?: string | null;
  category?: string | null;
};

export function suggestProductCode(name: string, clientCode?: string | null): string {
  const fromClient = clientCode?.trim();
  if (fromClient) return fromClient.slice(0, 40);

  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "NEW-ITEM";
}

export function draftFromRequirement(req: CatalogRequirementInput): CatalogProductDraft {
  const name = req.description.trim() || "New product";
  const presentation = quoteLinePresentation({
    clientName: name,
    clientCode: req.code,
    clientBrand: req.brand,
    clientModel: req.model,
    clientUnit: req.unit,
    extraNotes: req.extraNotes,
    catalogName: name,
  });

  return {
    name,
    code: suggestProductCode(name, req.code),
    unit: presentation.unit,
    brand: req.brand?.trim() || "",
    modelNo: req.model?.trim() || "",
    partNo: "",
    category: req.category?.trim() || "",
    hsnCode: "",
    description: presentation.description,
    productType: "GOODS",
    basePrice: 0,
    offerPrice: 0,
    taxRate: 18,
    taxCategory: "GST18",
    openingQty: 0,
    openingUnitCost: 0,
    active: true,
  };
}
