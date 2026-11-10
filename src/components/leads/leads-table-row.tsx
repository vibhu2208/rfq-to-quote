"use client";

import Link from "next/link";
import { memo } from "react";
import {
  Bell,
  Eye,
  FileText,
  Mail,
  Phone,
  Upload,
  UserRound,
  Zap,
} from "lucide-react";
import type { LeadRow } from "@/components/leads/types";
import {
  COLUMN_CELL_CLASS,
  money,
  relativeTime,
  slaLabel,
} from "@/components/leads/leads-workbench-helpers";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_INTAKE_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type LeadColumnId,
} from "@/lib/leads/constants";

export type LeadsTableRowProps = {
  row: LeadRow;
  visibleColumns: LeadColumnId[];
  selected: boolean;
  drawerActive: boolean;
  contactExpanded: boolean;
  quotesPopoverOpen: boolean;
  promoting: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleContact: () => void;
  onStageChange: (toStage: string) => void;
  onPriorityChange: (priority: string) => void;
  onPromote: () => void;
  onRemind: () => void;
  onLogCall: () => void;
  onUpload: () => void;
  onActivityEnter: (el: HTMLElement) => void;
  onActivityLeave: () => void;
  onQuotesToggle: (el: HTMLElement) => void;
};

export const LeadsTableRow = memo(function LeadsTableRow({
  row,
  visibleColumns,
  selected,
  drawerActive,
  contactExpanded,
  quotesPopoverOpen,
  promoting,
  onOpen,
  onToggleSelect,
  onToggleContact,
  onStageChange,
  onPriorityChange,
  onPromote,
  onRemind,
  onLogCall,
  onUpload,
  onActivityEnter,
  onActivityLeave,
  onQuotesToggle,
}: LeadsTableRowProps) {
  return (
    <tr
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest("a,button,input,select,textarea,label")
        ) {
          return;
        }
        onOpen();
      }}
      className={`group/lead cursor-pointer border-t border-dark-primary/5 hover:bg-dark-secondary/[0.03] ${
        drawerActive ? "bg-mid-green/8" : ""
      } ${
        row.intakeKind === "JUNK"
          ? "bg-amber-50/40"
          : row.intakeKind === "SKIPPED"
            ? "bg-slate-50/60"
            : ""
      }`}
    >
      <td className="w-7 shrink-0 px-1 py-2 sm:w-8 sm:px-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${row.leadNumber}`}
        />
      </td>
      {visibleColumns.map((col) => (
        <td
          key={col}
          className={`px-1.5 py-2.5 align-top sm:px-2 ${COLUMN_CELL_CLASS[col]}`}
        >
          {col === "leadId" ? (
            <div
              className="min-w-0 space-y-0.5"
              onMouseEnter={(e) => {
                onActivityEnter(e.currentTarget);
              }}
              onMouseLeave={onActivityLeave}
            >
              <button
                type="button"
                onClick={onOpen}
                className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11px] font-semibold tabular-nums tracking-tight text-dark-primary hover:underline sm:text-xs"
                title={row.leadNumber}
              >
                {row.leadNumber}
              </button>
              <p className="truncate text-[10px] leading-tight text-mid-green">
                {LEAD_CHANNEL_LABELS[
                  row.channel as keyof typeof LEAD_CHANNEL_LABELS
                ] || row.channel}
              </p>
              {row.intakeKind && row.intakeKind !== "REQUIREMENT" ? (
                <span
                  className={`inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    row.intakeKind === "JUNK"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200 text-slate-700"
                  }`}
                  title={row.junkReason || undefined}
                >
                  {LEAD_INTAKE_LABELS[row.intakeKind]}
                </span>
              ) : null}
            </div>
          ) : null}
          {col === "leadContact" ? (
            (() => {
              const name =
                row.customerCompany || row.customerName || "—";
              const contactLine =
                row.customerCompany && row.customerName
                  ? row.customerName
                  : "";
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleContact();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleContact();
                    }
                  }}
                  className={`w-full max-w-full cursor-pointer rounded-lg px-0.5 py-0.5 text-left transition hover:bg-dark-secondary/[0.05] ${
                    contactExpanded ? "" : "overflow-hidden"
                  }`}
                  title={
                    contactExpanded
                      ? "Click to collapse"
                      : "Click to expand contact"
                  }
                >
                  <p
                    className={`text-sm font-medium text-dark-primary ${
                      contactExpanded
                        ? "whitespace-normal break-words"
                        : "truncate"
                    }`}
                  >
                    {name}
                  </p>
                  {contactLine ? (
                    <p
                      className={`text-xs text-mid-green ${
                        contactExpanded
                          ? "whitespace-normal break-words"
                          : "truncate"
                      }`}
                    >
                      {contactLine}
                    </p>
                  ) : null}
                  {row.customerPhone ? (
                    <p
                      className={`mt-0.5 flex items-center gap-1 text-xs text-mid-green ${
                        contactExpanded ? "" : "min-w-0"
                      }`}
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      <span
                        className={
                          contactExpanded
                            ? "whitespace-normal break-all"
                            : "truncate"
                        }
                      >
                        {row.customerPhone}
                      </span>
                    </p>
                  ) : null}
                  {row.customerEmail ? (
                    <p
                      className={`mt-0.5 flex items-center gap-1 text-xs text-mid-green ${
                        contactExpanded ? "" : "min-w-0"
                      }`}
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      <span
                        className={
                          contactExpanded
                            ? "whitespace-normal break-all"
                            : "truncate"
                        }
                      >
                        {row.customerEmail}
                      </span>
                    </p>
                  ) : null}
                  {contactExpanded ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {row.customerPhone ? (
                        <a
                          href={`tel:${row.customerPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-medium text-mid-green hover:underline"
                        >
                          Call
                        </a>
                      ) : null}
                      {row.customerEmail ? (
                        <a
                          href={`mailto:${row.customerEmail}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-medium text-mid-green hover:underline"
                        >
                          Email
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen();
                        }}
                        className="text-[10px] font-medium text-mid-green hover:underline"
                      >
                        Open lead
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : null}
          {col === "requirement" ? (
            <div
              className="min-w-0 max-w-full space-y-0.5 overflow-hidden"
              title={
                [
                  row.category || row.parsedCategory,
                  row.junkReason,
                  row.subject || row.rawText,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              <p className="truncate text-[10px] font-medium text-dark-primary sm:text-[11px]">
                {row.category || row.parsedCategory || "—"}
              </p>
              <p className="line-clamp-1 break-all text-[10px] leading-snug text-mid-green sm:line-clamp-2 sm:text-[11px]">
                {row.junkReason ? `${row.junkReason} · ` : ""}
                {row.subject || row.rawText.slice(0, 60) || "—"}
              </p>
            </div>
          ) : null}
          {col === "stage" ? (
            <div
              className="min-w-0"
              onMouseEnter={(e) => {
                onActivityEnter(e.currentTarget);
              }}
              onMouseLeave={onActivityLeave}
            >
              <select
                value={row.leadStage}
                aria-label={`Stage for ${row.leadNumber}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onStageChange(e.target.value)}
                className="box-border w-full min-w-0 max-w-full rounded-lg border-0 bg-dark-secondary/8 px-1.5 py-1 text-[10px] font-medium text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/40"
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {col === "priority" ? (
            <select
              value={row.priority}
              aria-label={`Priority for ${row.leadNumber}`}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPriorityChange(e.target.value)}
              className={`box-border w-full min-w-0 max-w-full rounded-lg border-0 px-1.5 py-1 text-[10px] font-medium outline-none focus:ring-1 focus:ring-mid-green/40 ${
                row.priority === "HOT"
                  ? "bg-red-100 text-red-700"
                  : row.priority === "HIGH"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-dark-secondary/8 text-dark-primary"
              }`}
            >
              {LEAD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {LEAD_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          ) : null}
          {col === "quoteDetails" ? (
            row.quotes.length ? (
              (() => {
                const latest = row.quotes[0];
                const quoteTotal =
                  row._count?.quotes || row.quotes.length;
                const open = quotesPopoverOpen;

                return (
                  <div className="relative w-full max-w-full">
                    <button
                      type="button"
                      data-quotes-trigger={row.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuotesToggle(e.currentTarget);
                      }}
                      className="w-full max-w-full overflow-hidden rounded-lg bg-dark-secondary/[0.04] px-1.5 py-1.5 text-left transition hover:bg-dark-secondary/10 sm:px-2"
                      title={
                        quoteTotal > 1
                          ? "Click for all quotes"
                          : "Open quote"
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <Link
                          href={`/quotes/${latest.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-xs font-medium text-dark-primary hover:underline"
                        >
                          {latest.quoteNumber}
                        </Link>
                        {quoteTotal > 1 ? (
                          <span className="shrink-0 rounded-full bg-mid-green/15 px-1.5 py-0.5 text-[10px] font-medium text-mid-green">
                            {quoteTotal}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-mid-green">
                        {latest.status.replaceAll("_", " ")}
                        {latest.sentAt || latest.status !== "DRAFT"
                          ? ` · ${money(latest.grandTotal)}`
                          : " · draft"}
                        {latest.version > 1
                          ? ` · v${latest.version}`
                          : ""}
                        {quoteTotal > 1
                          ? open
                            ? " · hide"
                            : " · all"
                          : ""}
                      </span>
                    </button>
                  </div>
                );
              })()
            ) : (
              "—"
            )
          ) : null}
          {col === "assignedTo" ? (
            <span className="inline-flex max-w-full items-center gap-1 overflow-hidden">
              <UserRound className="h-3 w-3 shrink-0 text-mid-green" />
              <span className="truncate text-[11px]">
                {row.assignedTo?.name ||
                  row.assignedTo?.email ||
                  "Unassigned"}
              </span>
            </span>
          ) : null}
          {col === "expected" ? (
            <div className="min-w-0 space-y-0.5 text-[11px]">
              <p className="truncate font-medium text-dark-primary">
                {money(row.expectedValue)}
              </p>
              <p className="truncate text-mid-green">
                {row.expectedClosureAt
                  ? new Date(row.expectedClosureAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          ) : null}
          {col === "nextFollowUp" ? (
            <span className="block truncate text-[11px] text-mid-green">
              {relativeTime(row.nextFollowUpAt)}
            </span>
          ) : null}
          {col === "sla" ? (
            <span
              className={`block truncate text-[11px] ${
                slaLabel(row) === "Overdue"
                  ? "text-red-600"
                  : "text-mid-green"
              }`}
            >
              {slaLabel(row)}
            </span>
          ) : null}
          {col === "actions" ? (
            <div className="flex max-w-full flex-wrap items-center gap-0.5">
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                aria-label="View lead"
                title="View"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemind();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                aria-label="Set reminder"
                title="Remind"
              >
                <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogCall();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                aria-label="Log call"
                title="Log call"
              >
                <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpload();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                aria-label="Upload document"
                title="Upload document"
              >
                <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              {row.intakeKind === "JUNK" ||
              row.intakeKind === "SKIPPED" ? (
                <button
                  type="button"
                  disabled={promoting}
                  onClick={() => onPromote()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                  aria-label="Promote to requirement"
                  title="Promote"
                >
                  <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              ) : (
                <Link
                  href={`/rfq/${row.id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                  aria-label="Open RFQ"
                  title="RFQ"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Link>
              )}
            </div>
          ) : null}
        </td>
      ))}
    </tr>
  );
});
