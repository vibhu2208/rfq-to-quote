# Compliance Blueprint — Accounting, Inventory & GST

## Scope (MVP)
- Domestic goods trading: B2B and B2C, intra-state (CGST/SGST) and inter-state (IGST).
- Single company / GSTIN at launch; schema is multi-registration ready.
- Inventory: weighted-average costing; negative stock blocked.
- Application is the accounting source of truth.

## Explicitly deferred
Exports, SEZ, reverse charge, composition, branch transfers, cess, TDS, payroll, multi-GSTIN UI, batch/serial tracking, advanced bank feeds, fixed assets.

## Document lifecycles

### Quotation (existing)
`DRAFT → SENT → … → ACCEPTED | REJECTED`

### Proforma invoice (non-posting)
`DRAFT → ISSUED → (converted via new tax invoice) | CANCELLED`

Rules:
- Does **not** create GST liability, journal entries, AR, or stock movements.
- Conversion creates a **new** tax invoice; the proforma is not mutated into an invoice.

### Tax invoice (posting)
`DRAFT → ISSUED → PARTIALLY_PAID → PAID | CANCELLED | VOID`

On **issue**:
1. Immutable legal snapshot (party, addresses, GSTIN, HSN, tax rule version, totals).
2. Atomic stock movements for goods lines (if product linked).
3. Balanced journal: Debit AR; Credit Sales; Credit Output CGST/SGST or IGST; COGS/Inventory when stock moves.
4. Source quote status → `INVOICE_GENERATED`.

Corrections after issue: credit/debit notes or cancellation — never hard-delete.

### Credit / debit notes
`DRAFT → ISSUED | CANCELLED` linked to original invoice where applicable.

## GST determination
- Place of supply vs supplier state code decides CGST/SGST vs IGST.
- Line-level rates; header discount allocated proportionally to taxable value.
- Freight: taxable at configured rate when marked taxable (MVP default: taxable @ 18%).
- Rounding: half-up to 2 decimal places per amount field.
- Rule version stamped on issued documents for reproducibility.

## Fiscal calendar
- Indian financial year: 1 Apr – 31 Mar.
- Document series scoped by organisation (+ GST registration where required) and FY.
- Period statuses: `OPEN | SOFT_CLOSED | CLOSED | LOCKED`.
- Locked periods reject ordinary postings; reopen requires authorised audit reason.

## Inventory
- Balances derived from `StockMovement` ledger; `StockBalance` is a projection.
- Inbound updates weighted average; outbound uses current average cost.
- Idempotency keys prevent duplicate movements.

## Filing & e-invoice
- GSTR-1 / GSTR-3B drafts derived only from posted records.
- Government submission (IRP, e-way, return filing) requires explicit authorised approval.
- Provider-neutral GSP adapter; live calls disabled until credentials configured.
- Idempotent submission attempts with full request/response audit.

## Roles (seed)
Owner/Admin, Accountant, Sales, Inventory Manager, Auditor — via `Role` / `Permission`.

## Acceptance gates
1. Same inputs + rule version ⇒ identical tax totals.
2. Every journal balances; posted journals are not hard-deleted.
3. Stock projection equals movement sum; concurrent dispatch cannot oversell.
4. Issued invoice PDF checksum stored; regeneration must match snapshot fields.
5. No filing path bypasses approval + period checks.
