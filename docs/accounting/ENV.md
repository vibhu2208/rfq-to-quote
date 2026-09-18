# Accounting / GST environment

## Existing company seed fallbacks
- `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_GSTIN`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `SELLER_STATE`
- Prefer seeded `Organisation` / `GSTRegistration` after `npm run db:seed`

## Seed
- `SEED_ADMIN_PASSWORD` — required for a known admin login on fresh seed; if unset a random password is generated and not printed

## GSP / filing (Sandbox.co.in / Quicko)
- `GSP_ENABLED=true` — allow credentialed GSP calls
- `GSP_PROVIDER=sandbox` — Sandbox.co.in adapter (`generic` = stub/legacy)
- `GSP_MODE` — `sandbox` or `production` (label; host follows key prefix unless overridden)
- `GSP_API_KEY` / `GSP_API_SECRET` — from https://console.sandbox.co.in/ (`key_test_` / `key_live_`)
- `GSP_BASE_URL` — optional; auto `https://test-api.sandbox.co.in` or `https://api.sandbox.co.in`
- `GSP_EINVOICE_USERNAME` / `GSP_EINVOICE_PASSWORD` — NIC e-invoice API user (needed for real IRN)

### Sandbox flow
1. Authenticate: `POST /authenticate` with key + secret → JWT
2. Verify GSTIN: `POST /gst/compliance/public/gstin/search`
3. E-invoice / GSTR filing need extra NIC / taxpayer OTP setup beyond platform keys

## Document workflow
1. Quote → **Proforma** (dummy, non-posting GST liability)
2. Record **payment** on the proforma
3. Convert → **Tax invoice** (stock + journal + GST)

Direct quote → tax invoice is blocked by API and UI.

## Document storage
- Issued invoice PDFs currently write under `generated/invoices/` (local). Replace with object storage before multi-instance deploy.
