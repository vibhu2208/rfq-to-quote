# QuoteFlow user guide

QuoteFlow turns inbound purchase requests into quotes, then into proforma invoices and GST tax invoices. It matches catalog products and vendors, emails buyers and suppliers, and keeps stock and books in one workspace.

---

## Sign in

Open the app and sign in with your team email and password.

After login you land on **Dashboard**. Use the top navigation (or the menu on a phone) to move around. Your email is in the top-right; **Sign out** is in that menu.

The public quote form at `/request` does **not** require login. Share that link with buyers.

---

## How work usually flows

```
RFQ arrives (email, web form, or typed capture)
        ↓
Inbox → open RFQ → AI parse → pick products / vendors
        ↓
Generate quote → preview / PDF → send to buyer
        ↓
Buyer replies (check email thread) → revise or accept
        ↓
Create proforma → record payment → GST tax invoice
        ↓
Issue invoice / PDF / optional e-invoice
```

Keep **Products** and **Vendors** filled in first. Matching and quotes work from that catalog.

---

## Screens at a glance

| Menu | What it is for |
|------|----------------|
| **Dashboard** | Counts, quotes that need help, compact Copilot |
| **Inbox** | All RFQs; poll Gmail; capture a new requirement |
| **Copilot** | Full-screen AI assistant for books, GST, stock, follow-ups |
| **Quotes** | Draft, send, and track quotations |
| **Proformas** | Dummy invoices (no GST / stock posting yet) |
| **Invoices** | GST tax invoices after payment |
| **Clients** | Customers; onboard from GSTIN |
| **Products** | Catalog, prices, GST rates, CSV import |
| **Vendors** | Suppliers, categories, CSV/XLSX import |
| **Inventory** | Warehouse stock in/out, balances |
| **Knowledge** | Approved answers the quote AI can reuse |
| **Books** | Trial balance, AR ageing, payments, journals |
| **GST** | Verify GSTIN, returns, GSTR-2B, natural-language drafts |

RFQ detail pages live under `/rfq/…` (open them from Inbox). Quote editor is `/quotes/new` or `/quotes/…`.

---

## 1. Dashboard

You will see:

- **Open RFQs** — new / needs review / parsed. Link to Inbox.
- **Active products** — catalog size.
- **Quotes** — total count, plus **New quote** and **Public RFQ form**.
- **Need assistance** — quotes where the buyer asked something the AI could not answer safely.

**Quotes needing assistance** lists items flagged for a human. Open the quote, read the reason, reply, then **Mark as handled**.

**Recent quotes** is a shortcut into the last five quotations.

The compact **Copilot** on this page is the same assistant as **Copilot** in the menu.

---

## 2. Inbox (RFQs)

Inbox lists every lead: team capture, public web form, Gmail, and marketplace-style emails.

### Find a request

- Search customer, subject, or message text.
- Filter by **channel** (Manual, Email, Web form, Marketplace, WhatsApp) and **status** (New, Needs review, Parsed, Quoted, Closed).

### Capture requirement

**Capture requirement** opens `/rfq/new`. Two modes:

1. **Type it** — company, contact, email, phone, what they need, quantity, notes. Saves an RFQ and opens it.
2. **Upload → quote** — PDF, photo, Word, or similar. OCR extracts product, company, qty, and price into a **draft quote** (needs a Reducto API key). You go straight to the quote editor.

### Poll Gmail

**Poll Gmail** pulls **new unread** mail from the configured inbox and creates RFQs. Older unread mail is ignored after the first checkpoint so the inbox is not flooded.

IndiaMART / TradeIndia-style senders are tagged **Marketplace**.

**Public form ↗** opens `/request` in a new tab so you can copy the buyer link.

---

## 3. RFQ detail

Open a row in Inbox. This is the working screen for one request.

### Header actions

- **Thread** — inbound/outbound messages on this RFQ.
- **Linked quotes** — quotations already generated from it.
- **Re-parse with AI** — run structuring again (category, specs, line items).
- **Generate quote** — builds a quote from **selected** catalog products (count shows on the button).

### Cards

- **Customer** — company, contact, status. **Details** for full fields.
- **AI parse** — category, confidence, summary. **Details** for specs and extracted lines.
- **Matches** — how many requirements and vendors. **Message** shows the raw email/form text.

### Requested products

If AI found line items, each line is matched to the catalog on its own. Expand the section, pick a product per line (and optionally a vendor price for that line). **Search** on a line opens product search with live **stock** and **offer price**.

### Suggested products

Catalog matches for the whole RFQ. Tick products to include. You can search and add extras. Stock badges show on-hand qty (Low / Out).

### Suggested vendors

Deterministic match (not AI): category, keywords, last known price, score.

On a vendor you can:

- View **price by product line**.
- **Recore** — email them a revised quote request (`[REF:QF-…]` in the subject). Vendor must have an email.
- **Negotiate** — send a follow-up on price (email required, and a quoted amount).
- **Thread** — that vendor’s email conversation.
- **Check vendor replies** — poll Gmail for answers to Recore/negotiate mails.

Statuses you may see: **Declined**, **Negotiating**, **Updated** (counter-offer parsed).

### Marketplace prices

Fetches Amazon.in (SerpAPI) and Flipkart / IndiaMART (Apify) for a sanity check against catalog price. Use **Refresh** if the category is already parsed.

### Typical RFQ steps

1. Confirm customer and the raw request.
2. If parse looks wrong, **Re-parse with AI**.
3. For each requested line, pick the catalog product (and vendor if you want their last price).
4. Optionally Recore vendors who should requote.
5. **Generate quote**.

---

## 4. Quotes

**Quotes** lists number, buyer, status, last reply intent, date, and total. An **Assist** badge means a human should answer.

**New quote** opens a blank builder (no RFQ).

### Quote builder

Fill:

- Buyer name, company, email, phone, state, address.
- **Buyer GSTIN** (15 characters) — lookup fills legal name and address when GST is configured.
- Line items: search catalog, set alias name (what prints on the PDF), qty, unit price, tax %.
- GST on/off, GST mode, delivery, discount, other tax, notes.
- Totals can be overridden if you must match a number the buyer already has.

Actions:

- **Preview** — on-screen quotation.
- **Save draft** — required before PDF/send.
- **PDF** — branded download (after save).
- **Send quote** — Email (WhatsApp option is listed but not wired; download PDF and send yourself).

Email send uses the Gmail mailbox. Put the buyer’s address in the send dialog.

### Quote life & email thread

On an existing quote:

- Timeline of stages (draft → sent → replies → accepted, and so on).
- **Check this email thread** — look in Gmail for buyer replies, run AI intent analysis.
- If the buyer asked something outside the quote/knowledge base, the quote is flagged **Needs manual assistance**. Draft a reply in **Reply to buyer**, send, then **Mark as handled**.

**Accounting** on a sent/accepted quote: **Create proforma**. You cannot jump straight to a tax invoice from a quote.

---

## 5. Proformas (dummy invoices)

A proforma is a commercial document only. It does **not** post GST, stock, or journals.

From the quote: **Create proforma**, then open it under **Proformas**.

On the proforma:

1. If the client has no GSTIN, link one (lookup from the GST portal).
2. **Issue proforma** if it is still a draft.
3. **Record payment** (amount; default is the remaining balance).
4. **Convert to tax invoice** — allowed only after payment **and** a GSTIN.

---

## 6. Tax invoices

**Invoices** shows GST sales invoices with balance due.

Open one to:

- **Issue** (GSTIN required).
- Download **PDF**.
- Submit **e-invoice** (IRN) when GSP credentials are set.
- Cancel if your books process allows it.

Stock (goods) and ledger entries post when the tax invoice is issued, not on the proforma.

---

## 7. Clients

Search active customers.

**Onboard** with a 15-character GSTIN (plus optional email/phone). Fetch from the GST portal, check the preview (legal name, address, status), then save. Verified GSTIN is required before a tax invoice.

---

## 8. Products

Search and filter active/inactive.

**Add product** fields: code, name, description, unit, type (**Goods** or **Service**), base price, offer price, tax rate, tax category, opening qty/cost for goods.

**Import** a CSV of products. Goods appear on **Inventory** automatically.

Offer price is what RFQ matching and quotes use by default.

---

## 9. Vendors

Search and filter. **Add** name, phone, email, WhatsApp id, preferred channel, and one or more **categories** (category, subcategory, keywords). Matching uses those keywords.

**Import** at `/vendors/import` — CSV, XLSX, or XLS. Columns: `name`, `phone`, `email`, `whatsappId`, `preferredChannel`, `category`, `subcategory`, `keywords`. Duplicate rows group by phone, then email, then name. Preview creates vs updates, then commit.

Vendors need an **email** for Recore and Negotiate.

---

## 10. Inventory

Shows warehouse **balances** (on hand, average cost, value) and recent **movements**.

Use the form to post **in** (opening stock / purchase, with unit cost) or **out** (adjustment). Negative stock is blocked. Costing is weighted average.

Services do not appear here — only **Goods**.

---

## 11. Knowledge base

Store question/answer pairs the quote-reply AI may reuse (delivery terms, warranty, lead time, and similar).

Add a pair, edit an answer, or deactivate an entry so it is no longer used.

---

## 12. Copilot

Full-page chat (also on Dashboard in compact form).

- Asks about live quotes, invoices, GST, and stock.
- Can draft a follow-up email.
- **New chat** / saved chats in the left sidebar.
- Enter to send, Shift+Enter for a new line.

Example prompts: “Quotes under negotiation”, “GST on a quote number”, “Draft an email for the latest quote”.

---

## 13. Books (accounting)

- **Trial balance** — debit/credit by account; should stay balanced.
- **AR ageing** — unpaid tax invoices by age.
- **Recent payments** and **posted journals**.

Entries are created by inventory adjustments, payments, and issued tax invoices — you do not type journals by hand here.

---

## 14. GST & capture

- **Verify GSTIN** — 15 characters; can create the client party.
- Prepare **GSTR-1** / **GSTR-3B** for a period (`YYYY-MM`).
- Import **GSTR-2B** and reconcile.
- **Natural-language draft** — describe a booking in plain language; it stores a draft for review.
- Filing and e-invoice need explicit approval and GSP keys. Tax invoices still require **proforma + payment** first.

Configuration (company GSTIN, sandbox vs live) comes from environment variables, not this screen.

---

## Public RFQ form (`/request`)

Share with buyers. They enter company, contact name, email, phone, product needed, quantity, and notes. On submit they see “Request received”; you see it in **Inbox** as a web-form RFQ.

---

## RFQ and quote statuses (typical)

**RFQ:** New → Needs review / Parsed → Quoted / Closed.

**Quote:** Draft → Sent → Under negotiation / Accepted / and related flags such as needs assistance.

**Proforma / invoice:** Draft → Issued (invoice may also show paid/cancelled depending on payments).

---

## Email you should know about

| Action | What happens |
|--------|----------------|
| **Poll Gmail** (Inbox) | New unread mail → RFQs |
| **Send quote** | PDF/email to buyer from your Gmail |
| **Check this email thread** (quote) | Buyer replies on that quote |
| **Recore / Negotiate** (RFQ) | Mail to vendor with a reference tag |
| **Check vendor replies** (RFQ) | Vendor prices parsed back onto the RFQ |

For a test Recore: set a vendor email to an inbox you control, send Recore, reply with a price such as `₹45,000 per unit`, then **Check vendor replies** or **Poll Gmail**.

---

## Setup (team / developer)

1. Copy `.env.example` to `.env` and set at least `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `OPENROUTER_API_KEY`, and Gmail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`).
2. Optional: Reducto (document capture), SerpAPI, Apify, GST/GSP keys.
3. `npm install` then `npm run db:setup` (migrate + seed).
4. `npm run dev` — open [http://localhost:3000](http://localhost:3000).

On first seed, set `SEED_ADMIN_PASSWORD` if you want a known login; otherwise check the seed output for the generated admin password (`admin@example.com`).

### Gmail app password

1. Enable 2-Step Verification on the Google account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. Put it in `GMAIL_APP_PASSWORD`.

Inbound webhook (Postmark / SendGrid), if you use it:

```text
POST /api/webhooks/email?secret=YOUR_EMAIL_WEBHOOK_SECRET
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local app |
| `npm run db:setup` | Migrate and seed |
| `npm run email:poll` | Pull unread Gmail into Inbox |
| `npm run email:poll -- --include-existing` | Also import existing unread mail |

On Vercel / Render, set the same env vars in the host dashboard. `NEXTAUTH_URL` must be **that** site’s public URL (not localhost, and not the other host’s URL). Redeploy after changing env vars.
