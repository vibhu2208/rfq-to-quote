# Acceptance test catalogue

## Tax engine
- [ ] Intra-state sale splits GST equally into CGST/SGST.
- [ ] Inter-state sale posts full GST as IGST.
- [ ] Missing/invalid place of supply is rejected for tax invoices.
- [ ] Header discount reduces taxable value proportionally across lines.
- [ ] Taxable freight increases tax base; non-taxable freight does not.
- [ ] Historical rule version reproduces prior totals.

## Documents
- [ ] Proforma from accepted quote does not create stock/journal/AR.
- [ ] Tax invoice from quote or proforma allocates FY-scoped number once.
- [ ] Issue stores immutable snapshot and PDF checksum.
- [ ] Cancelled invoice cannot be paid or re-issued.

## Inventory
- [ ] Purchase/opening receipt updates weighted average correctly.
- [ ] Sale that would drive qty negative is blocked.
- [ ] Return restores quantity and valuation consistently.
- [ ] Idempotent movement key is a no-op on retry.

## Accounting
- [ ] Invoice issue creates balanced AR/Sales/GST/(COGS) journal.
- [ ] Receipt allocation reduces `balanceDue` and updates status.
- [ ] Locked period rejects postings.
- [ ] Trial balance and AR control account reconcile.

## GST / filing
- [ ] GSTR-1 draft figures drill down to invoices.
- [ ] Submission without approval is rejected.
- [ ] Duplicate submit with same idempotency key does not double-file.
