export type MarketplaceSource = "amazon" | "flipkart" | "indiamart";

export type MarketplaceListing = {
  source: MarketplaceSource;
  title: string;
  price: number | null;
  currency: "INR";
  link: string;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
  supplier?: string;
  moq?: string;
};

export type MarketplaceLineComparison = {
  lineNumber: number;
  label: string;
  query: string;
  catalogPrice: number | null;
  catalogProductName: string | null;
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
};

export type MarketplaceComparison = {
  query: string;
  budget: number | null;
  catalogPrice: number | null;
  catalogProductName: string | null;
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
  /** Per requested line, so one RFQ does not mix unrelated products in one table. */
  lines?: MarketplaceLineComparison[];
  fetchedAt: string;
  cached?: boolean;
  needsFetch?: boolean;
  errors?: string[];
};
