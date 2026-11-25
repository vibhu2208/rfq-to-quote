import { resolveGstSplit } from "@/lib/tax";

export type GstModeMismatch = {
  mismatch: boolean;
  /** User-facing confirm message when mismatch is true. */
  message: string;
};

/**
 * Warn when the trader manually picks IGST on intra-state (or CGST/SGST on inter-state).
 */
export function gstModeMismatchWarning(input: {
  withGst: boolean;
  buyerState: string;
  sellerState: string;
  gstMode: "AUTO" | "CGST_SGST" | "IGST";
}): GstModeMismatch {
  if (!input.withGst || input.gstMode === "AUTO") {
    return { mismatch: false, message: "" };
  }
  const auto = resolveGstSplit(
    true,
    input.buyerState,
    input.sellerState,
    "AUTO"
  );
  if (input.gstMode === "IGST" && auto === "CGST_SGST") {
    return {
      mismatch: true,
      message:
        "Buyer and seller appear to be in the same state. IGST is usually for inter-state supply. Continue with IGST on this quote?",
    };
  }
  if (input.gstMode === "CGST_SGST" && auto === "IGST") {
    return {
      mismatch: true,
      message:
        "Buyer and seller appear to be in different states. CGST + SGST is usually for intra-state supply. Continue with CGST + SGST?",
    };
  }
  return { mismatch: false, message: "" };
}