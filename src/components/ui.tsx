import { formatMoney } from "@/lib/tax";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-light-green/25 text-dark-primary",
  SENT: "bg-mid-green/20 text-mid-green",
  VIEWED: "bg-mid-green/30 text-dark-secondary",
  UNDER_NEGOTIATION: "bg-dark-secondary/10 text-dark-secondary",
  REVISED: "bg-light-green/40 text-dark-primary",
  ACCEPTED: "bg-mid-green text-background",
  REJECTED: "bg-dark-primary/15 text-dark-primary",
  INVOICE_GENERATED: "bg-dark-secondary/20 text-dark-secondary",
  PAYMENT_PENDING: "bg-light-green/50 text-dark-primary",
  PAYMENT_RECEIVED: "bg-mid-green/40 text-dark-primary",
  DELIVERED: "bg-mid-green/50 text-dark-primary",
  CLOSED: "bg-dark-primary/20 text-dark-primary",
  // Invoice / proforma
  ISSUED: "bg-mid-green text-background",
  PARTIALLY_PAID: "bg-light-green/50 text-dark-primary",
  PAID: "bg-mid-green/40 text-dark-primary",
  CANCELLED: "bg-dark-primary/15 text-dark-primary",
  VOID: "bg-dark-primary/20 text-dark-primary",
  // RFQ statuses
  NEW: "bg-light-green/25 text-dark-primary",
  NEEDS_REVIEW: "bg-dark-primary/15 text-dark-primary",
  PARSED: "bg-mid-green/25 text-mid-green",
  QUOTED: "bg-mid-green text-background",
  // GST / stock
  PREPARED: "bg-mid-green/25 text-mid-green",
  FILED: "bg-mid-green text-background",
  MATCHED: "bg-mid-green/40 text-dark-primary",
  UNMATCHED: "bg-dark-primary/15 text-dark-primary",
  MISMATCH: "bg-dark-primary/20 text-dark-primary",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${
        statusStyles[status] || "bg-light-green/20 text-dark-primary"
      }`}
    >
      {label.toLowerCase()}
    </span>
  );
}

export function Money({ value }: { value: number | string }) {
  return <span className="tabular-nums">{formatMoney(value)}</span>;
}
