# QuoteFlow — RFQ to Quote

Product catalog, RFQ inbox (web + email), AI parsing via OpenRouter,
deterministic product/vendor matching, quote builder, and branded PDF export.

## Setup

1. Copy env and set secrets:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL` — Neon Postgres URI
- `OPENROUTER_API_KEY` — for RFQ AI parsing
- `EMAIL_WEBHOOK_SECRET` — shared secret for inbound email webhook
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — Gmail inbox to poll for RFQs

Optional:
- `REDUCTO_API_KEY` — document/photo OCR on Capture requirement ([reducto.ai](https://reducto.ai))
- `SERPAPI_KEY` — Amazon.in price lookup on RFQ detail pages ([serpapi.com](https://serpapi.com))
- `APIFY_TOKEN` — Flipkart + IndiaMART price lookup via Apify ([apify.com](https://apify.com))

2. Install and initialize the database:

```bash
npm install
npm run db:setup
```

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

- **Team login:** `admin@example.com` / `admin123`
- **Public RFQ form:** [/request](http://localhost:3000/request)
- **Inbox:** [/inbox](http://localhost:3000/inbox)
- **Vendors:** [/vendors](http://localhost:3000/vendors)

## Phase status

| Phase | Status |
|-------|--------|
| 1 Catalog + quote builder + PDF | Done |
| 2 RFQ inbox + web form + email webhook | Done (WhatsApp later) |
| 3 AI structuring via OpenRouter | Done |
| 4 Vendor ingestion + deterministic matching | Done |
| 5 Recore vendor email + reply parsing | Done |
| 6+ WhatsApp, negotiation | Not started |

## Vendors

- Add/edit vendors manually at `/vendors`.
- Import `CSV`, `XLSX`, or `XLS` at `/vendors/import`.
- Use `sample-vendors.csv` as a template.
- Import columns: `name`, `phone`, `email`, `whatsappId`,
  `preferredChannel`, `category`, `subcategory`, `keywords`.
- Repeated vendor rows are grouped by phone, then email, then normalized name.
- The import preview shows creates and updates before commit.
- RFQ detail pages show matching vendors, deterministic `productKey`, match score,
  and last known product price. This matching step does not call AI.
- **Recore** emails a matched vendor asking for a revised quote. Vendor replies
  are picked up on the next **Poll Gmail** and update last price + RFQ thread.

## Recore (vendor quote requests)

1. Open an RFQ → **Suggested vendors** → click **Recore** (vendor must have an email).
2. The app sends email from `GMAIL_USER` via Gmail SMTP with a `[REF:QF-…]` tag.
3. Vendor replies to that email with a price (e.g. `₹45,000 per unit`).
4. Click **Poll Gmail** on Inbox (or `npm run email:poll`) — reply is linked to the RFQ,
   price is parsed, and **VendorProductHistory** is updated.

For local testing, set a vendor email to your own address on `/vendors`, send Recore,
then reply from that inbox.

## Gmail intake (recommended for testing)

Only new unread email sent to `GMAIL_USER` (e.g. `vaibhavsingh5373@gmail.com`) is pulled into the RFQ inbox. On first setup, the app saves a Gmail checkpoint and ignores older unread mail so the inbox is not flooded.

1. Turn on **2-Step Verification** for that Google account.
2. Create an **App Password**: [Google App Passwords](https://myaccount.google.com/apppasswords) → Mail → Windows Computer.
3. Put the 16-character password in `.env` as `GMAIL_APP_PASSWORD` (no spaces).
4. Start the app (`npm run dev`), open **Inbox**, click **Poll Gmail**.

Or from the terminal:

```bash
npm run email:poll
```

To deliberately backfill existing unread mail, run:

```bash
npm run email:poll -- --include-existing
```

Flow for each new email:

```
Gmail unread → RFQ created → AI parse → Suggested products + Suggested vendors (last price)
```

Open an RFQ in the inbox to see vendor pricing matches.

## Email inbound webhook (optional)

Point Postmark Inbound or SendGrid Inbound Parse to:

```
POST /api/webhooks/email?secret=YOUR_EMAIL_WEBHOOK_SECRET
```

Also accepts a simple JSON body for local testing:

```bash
curl -X POST "http://localhost:3000/api/webhooks/email?secret=change-me-email-webhook-secret" ^
  -H "Content-Type: application/json" ^
  -d "{\"from\":\"Buyer <buyer@acme.com>\",\"subject\":\"Need 2 i7 PCs\",\"text\":\"Looking for 2 Core i7 desktops with 32GB RAM.\"}"
```

IndiaMART / TradeIndia-style lead emails are tagged as `MARKETPLACE` when the sender domain matches.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run db:push` | Push Prisma schema |
| `npm run db:seed` | Seed admin + sample products/vendors/history |
| `npm run db:setup` | Push + seed |
| `npm run email:poll` | Pull unread Gmail into RFQ inbox |
