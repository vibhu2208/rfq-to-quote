# Telemarketing & Campaigns — implementation plan

Inspired by Pactle’s call-list CRM and WhatsApp broadcast flows; QuoteFlow UI follows existing workbench/drawer patterns (Leads workbench).

## Data model (additive Prisma)

### Telemarketing
| Entity | Purpose |
|--------|---------|
| `TelemarketingContact` | Call-list row: name, company, role, phone, email, `source` (MANUAL/IMPORTED), `callStatus`, assignee, tags JSON, `convertedLeadId` → `Rfq`, `archivedAt`, optional `primaryContactId` for alternatives |
| `TelemarketingCall` | Logged call: status, note, optional `followUpAt`, actor |
| `TelemarketingReminder` | Follow-up: type CALL/WHATSAPP/MEETING/CUSTOM, `dueAt`, note, assignee, status PENDING/DONE/CANCELLED |
| `TelemarketingTimelineEvent` | Audit stream for drawer Timeline tab |

Enums: `TelemarketingCallStatus` (NO_ACTION, CONNECTED, CALL_BACK_REQUESTED, COULDNT_CONNECT, NOT_INTERESTED, MOVE_TO_LEAD), `TelemarketingReminderType`, `TelemarketingTimelineType`.

### Campaigns
| Entity | Purpose |
|--------|---------|
| `Campaign` | name, `messageBody` (with `{{name}}`/`{{company}}`/`{{phone}}` vars), `status`, `launchMode` INSTANT/SCHEDULED, `scheduledAt`, `launchedAt`, `recipientMode` TELEMARKETING/LEADS/CSV, filter JSON, aggregate counters |
| `CampaignRecipient` | phone, optional name/company, `sourceRef`, `status`, `skipReason` (noop queue message), optional reply fields |

Enums: `CampaignStatus` (DRAFT, SCHEDULED, RUNNING, COMPLETED, FAILED, CANCELLED, PAUSED), `CampaignRecipientStatus`, `CampaignRecipientMode`.

No changes to existing tables; only new tables and optional `User` relation fields.

## Pages & navigation
- `/telemarketing` — list, status chips, Source/View filters, search, inline assignee, import wizard, new-contact modal, contact drawer (Calls / Reminders / Timeline / Linked), log-call & reminder modals, due-reminder highlights.
- `/campaigns` — summary stat cards, status filter, list + detail drawer, new-campaign drawer (recipients builder, schedule/instant), launch confirmation, **banner**: no messaging provider connected.
- `AppNav`: Telemarketing + Campaigns under Overview/Sales.

## APIs
| Method | Path | Role |
|--------|------|------|
| GET/PATCH | `/api/telemarketing/contacts` | List (filters, counts), create batch |
| GET/PATCH/DELETE | `/api/telemarketing/contacts/[id]` | Detail, update, archive |
| POST | `/api/telemarketing/contacts/import` | CSV parse + column map payload → create |
| POST | `/api/telemarketing/contacts/[id]/calls` | Log call; MOVE_TO_LEAD runs `moveContactToLead` |
| GET/POST | `/api/telemarketing/contacts/[id]/reminders` | List/create reminders |
| PATCH | `/api/telemarketing/reminders/[id]` | Complete/cancel |
| GET | `/api/telemarketing/reminders/due` | Org-wide due reminders |
| GET/POST | `/api/campaigns` | List + create draft |
| GET/PATCH/DELETE | `/api/campaigns/[id]` | Detail, update draft, delete draft |
| POST | `/api/campaigns/[id]/recipients` | Rebuild recipients from mode + ids/csv rows |
| POST | `/api/campaigns/[id]/launch` | Confirm launch → noop channel queues all |

Shared libs: `lib/telemarketing/*`, `lib/campaigns/*` (template vars, recipient builder, `move-to-lead`, timeline), `lib/campaigns/channel.ts` (pluggable `CampaignChannel`, default `noOpWhatsAppProvider`).

## Move to Lead
1. `createRfqWithMessage` (channel REFERRAL, subject from contact, referralSource `Telemarketing`).
2. Set contact `callStatus` MOVE_TO_LEAD, `convertedLeadId`, timeline + lead activity.
3. Assign lead to contact assignee when set.

## Campaign launch (no real send)
1. User confirms Launch → status RUNNING.
2. `noOpWhatsAppProvider.sendBatch` marks each recipient QUEUED with skipReason `queued (no provider connected)`.
3. Campaign → COMPLETED; counters updated from recipient rows.

## Tests (Vitest)
- `move-to-lead.test.ts` — pure helper / lead payload shaping.
- `campaign-recipients.test.ts` — recipient builder from telemarketing/leads/csv rows.
- `campaign-template.test.ts` — variable interpolation.

## Phases (single PR)
1. Migration + schema + libs + APIs  
2. Telemarketing UI  
3. Campaigns UI + nav  
4. Tests, `npm run build`, `npm test`

## Deferred
- Real WhatsApp/provider OAuth and delivery webhooks  
- Alternative-contact grouping UI (schema supports `primaryContactId`; minimal v1)  
- Campaign scheduling cron (manual launch only for scheduled drafts at launch time)  
- XLSX import (CSV only in v1; same parser as Leads)  
- Recurrence on reminders  