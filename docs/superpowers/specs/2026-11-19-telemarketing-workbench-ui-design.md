# Telemarketing workbench UI alignment

**Date:** 2026-11-19  
**Status:** Approved in conversation; awaiting implementation plan  
**Scope:** Visual/layout pass on `/telemarketing` only — no API or data-model changes

## Goal

Make the Telemarketing contacts workbench match the reference screenshot and QuoteFlow platform colors: screenshot-style filter/action row, chevron call-status steps, and a table that fills the remaining viewport and scrolls internally.

## Current state

- Primary UI: `src/components/telemarketing/telemarketing-workbench.tsx`
- Supporting: `status-chip.tsx`, drawer/modals under `src/components/telemarketing/`
- Call statuses already match the screenshot labels via `src/lib/telemarketing/constants.ts`
- Hardcoded accent `#2f4a2b` / cream greens diverge from platform tokens in `globals.css`
- Status filters are rounded chips, not chevrons
- Page/`main` scrolls as a whole; table does not own the remaining height

## Platform colors (source of truth)

| Token | Hex | Use |
|-------|-----|-----|
| `dark-primary` | `#0b2b26` | Text, strong accents |
| `dark-secondary` | `#163832` | Active chevron, primary CTAs (preferred) |
| `mid-green` | `#235347` | Secondary accents, icons, muted text |
| `light-green` | `#8eb69b` | Soft accents |
| `background` | `#f5f1e8` | Page / soft surface |

Replace telemarketing `#2f4a2b`, `#faf9f6`, `#e8f5e6`, `#d4e7d0` with these tokens (or token opacities). Status pills may keep rose/amber for Not Interested / Call Back; Connected / Move to Lead must use mid/light green family, not the old forest hex.

## Layout

```
┌─ Title (Telemarketing) ─────────────────────────────────────┐
├─ Toolbar row ───────────────────────────────────────────────┤
│  [Search] [View] [Source] [More filters]   [Import] [New]   │
├─ Chevron call-status bar (full width) ──────────────────────┤
│  All › No action › Connected › … › Move to Lead             │
├─ Table panel (flex-1, min-h-0, overflow-auto) ──────────────┤
│  sticky thead … rows …                                      │
└─ Pagination / footer (if any) ──────────────────────────────┘
```

### Toolbar

- Left: Search contacts, View (Active/Archived), Source (All/Imported/Manual), **More filters** control.
- More filters opens a compact popover/dropdown with Assignee and District/tag (existing state/query params unchanged). Show a subtle active indicator when either differs from “All”.
- Right: Import contacts + New contact — `bg-dark-secondary` (or `mid-green`) + `text-background`, same weight as screenshot.
- Move Import/New out of the page-header actions into this toolbar row so the header is title-only (or title + minimal chrome).

### Call-status chevrons

- Replace chip row with a process bar modeled on `LeadProcessBar` (`clip-path` chevrons).
- Steps: All + each `TELEMARKETING_CALL_STATUSES` label/count.
- Selected: `bg-dark-secondary text-background`; idle: white / light ring; counts in small badges.
- Behavior: same as today (`status` filter + `statusCounts` from list API). Selecting the active step again may clear to All (match Leads) or stay selected — prefer **toggle off → All** for consistency with Leads.

### Table coverage & scroll

- Workbench root: `flex min-h-0 flex-1 flex-col` filling `main` height (parent already `h-dvh` / `min-h-0`).
- Toolbar + chevrons: shrink-0.
- Table wrapper: `min-h-0 flex-1 overflow-auto` (vertical + horizontal as needed), sticky header using platform surface (`bg-background` or white with token border).
- Remove excess bottom padding that shrinks the list (`pb-24` unless still required for FAB clearance — keep a small safe padding if FAB overlaps).
- Do not put the whole workbench inside a short card that leaves empty page chrome; filters sit above, list owns the rest.

## Out of scope

- New call statuses, schema, or API fields
- Changing import wizard logic (only button/modal CTA colors)
- Leads / Campaigns pages
- Extracting shared chevron package across Leads (optional later; can copy pattern inline or tiny local component)

## Files expected to change

- `src/components/telemarketing/telemarketing-workbench.tsx` (primary)
- `src/components/telemarketing/status-chip.tsx` (token colors)
- Possibly light touch: drawer / callback modal / timeline hardcoded greens for consistency

## Acceptance criteria

1. No `#2f4a2b` (or equivalent off-palette greens) remain as primary CTA/active chrome in telemarketing UI; CTAs/active steps use platform tokens.
2. Top filter row matches screenshot structure (search + view + source + more filters; import/new on the right).
3. Call statuses appear as a connected chevron step bar with counts.
4. On a typical desktop viewport, the contacts table fills the space below the bars and scrolls inside that panel (sticky header).
5. Existing filters, expand/alternatives, assign, archive, drawer, and import flows still work.
