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

export type MarketplaceComparison = {
  query: string;
  budget: number | null;
  catalogPrice: number | null;
  catalogProductName: string | null;
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
  fetchedAt: string;
  cached?: boolean;
  needsFetch?: boolean;
  errors?: string[];
};
