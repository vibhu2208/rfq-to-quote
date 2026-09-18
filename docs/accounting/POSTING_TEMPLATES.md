# Posting templates (MVP domestic trading)

## Sale invoice issue
| Account (systemKey) | Debit | Credit |
|---|---|---|
| AR | grand total | |
| SALES | | taxable value (excl. tax) |
| OUTPUT_CGST | | cgst (intra) |
| OUTPUT_SGST | | sgst (intra) |
| OUTPUT_IGST | | igst (inter) |
| COGS | cost of goods | |
| INVENTORY | | cost of goods |

## Customer receipt
| Account | Debit | Credit |
|---|---|---|
| CASH or BANK | amount | |
| AR | | amount |

## Purchase bill (when enabled)
| Account | Debit | Credit |
|---|---|---|
| INVENTORY / EXPENSE | taxable | |
| INPUT_CGST / INPUT_SGST / INPUT_IGST | tax | |
| AP | | total |

## Credit note (sales return)
Reverse sale tax and AR; restore inventory at average cost when goods returned.

## Rules
- Debits must equal credits (tolerance 0.01 INR).
- Period must be OPEN (or authorised reopen).
- Idempotency key on source document prevents double posting.
