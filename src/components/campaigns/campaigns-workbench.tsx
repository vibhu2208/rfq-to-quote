"use client";

import Papa from "papaparse";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { CAMPAIGN_TEMPLATE_HINT } from "@/lib/campaigns/template";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaigns/constants";
import type { CampaignStatus } from "@prisma/client";

type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  launchMode: string;
  scheduledAt: string | null;
  launchedAt: string | null;
  messageBody: string;
  totalRecipients: number;
  queuedCount: number;
  deliveredCount: number;
  failedCount: number;
  pendingCount: number;
  replyCount: number;
  updatedAt: string;
};

type CampaignDetail = CampaignRow & {
  recipients: Array<{
    id: string;
    phone: string;
    name: string;
    status: string;
    skipReason: string;
    messageBody: string;
    replyText: string;
  }>;
};

const fieldClass =
  "h-9 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-[13px] text-dark-primary outline-none focus:bg-white focus:ring-1 focus:ring-mid-green/30";

export function CampaignsWorkbench() {
  const [items, setItems] = useState<CampaignRow[]>([]);
  const [summary, setSummary] = useState({
    totalCampaigns: 0,
    totalRecipients: 0,
    delivered: 0,
    replies: 0,
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [launchConfirm, setLaunchConfirm] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    messageBody: "Hi {{name}}, thanks for connecting with {{company}}.",
    launchMode: "INSTANT" as "INSTANT" | "SCHEDULED",
    scheduledAt: "",
    recipientMode: "TELEMARKETING" as "TELEMARKETING" | "LEADS" | "CSV",
    csvRows: [] as Record<string, string>[],
    csvHeaders: [] as string[],
    phoneColumn: "",
  });

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status !== "ALL") p.set("status", status);
    return p.toString();
  }, [q, status]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns?${queryString}`);
      const data = await res.json();
      setItems(data.items || []);
      setSummary(data.summary || summary);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- summary defaults are static
  }, [queryString]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`);
    const data = await res.json();
    setDetail(data.campaign || null);
    setDrawerId(id);
  }, []);

  async function saveCampaign(andLaunch: boolean) {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        messageBody: draft.messageBody,
        launchMode: draft.launchMode,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
        recipientMode: draft.recipientMode,
        saveAsScheduled: draft.launchMode === "SCHEDULED" && !andLaunch,
      }),
    });
    const data = await res.json();
    const campaignId = data.campaign?.id as string;
    if (!campaignId) return;

    const recipientBody: Record<string, unknown> = { mode: draft.recipientMode };
    if (draft.recipientMode === "CSV" && draft.csvRows.length) {
      recipientBody.rows = draft.csvRows;
      recipientBody.mapping = {
        phone: draft.phoneColumn,
        name: draft.csvHeaders.find((h) => /name/i.test(h)),
        company: draft.csvHeaders.find((h) => /company/i.test(h)),
        email: draft.csvHeaders.find((h) => /email/i.test(h)),
      };
    }

    await fetch(`/api/campaigns/${campaignId}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipientBody),
    });

    setCreateOpen(false);
    if (andLaunch) {
      setLaunchConfirm(campaignId);
    } else {
      void refresh();
    }
  }

  async function launchCampaign(id: string) {
    await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    setLaunchConfirm(null);
    setDrawerId(null);
    void refresh();
  }

  function onCsvFile(file: File) {
    void file.text().then((text) => {
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      const headers = parsed.meta.fields?.filter(Boolean) as string[] | undefined;
      setDraft((d) => ({
        ...d,
        csvRows: parsed.data,
        csvHeaders: headers || [],
        phoneColumn: headers?.find((h) => /phone|mobile/i.test(h)) || headers?.[0] || "",
        recipientMode: "CSV",
      }));
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>No messaging provider is connected.</strong> Launches use a placeholder channel
            and mark recipients as queued (no provider connected).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-dark-primary">Campaigns</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-mid-green px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total campaigns", value: summary.totalCampaigns },
          { label: "Total recipients", value: summary.totalRecipients },
          { label: "Delivered / queued", value: summary.delivered },
          { label: "Replies", value: summary.replies },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-dark-primary/8 bg-white p-4"
          >
            <p className="text-xs text-mid-green">{card.label}</p>
            <p className="text-2xl font-semibold text-dark-primary">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dark-primary/8 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green/60" />
            <input
              className={`${fieldClass} w-full pl-9`}
              placeholder="Search campaigns"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-dark-primary/8 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="sticky top-0 bg-dark-secondary/[0.04] text-xs text-mid-green">
            <tr>
              <th className="px-3 py-2">Campaign</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Launch</th>
              <th className="px-3 py-2">Recipients</th>
              <th className="px-3 py-2">Queued</th>
              <th className="px-3 py-2">Failed</th>
              <th className="px-3 py-2">Replies</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-dark-primary/6 hover:bg-dark-secondary/[0.03]"
                  onClick={() => void loadDetail(row.id)}
                >
                  <td className="px-3 py-2 font-medium text-dark-primary">{row.name}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-mid-green">
                    {row.launchedAt
                      ? format(new Date(row.launchedAt), "d MMM yyyy, h:mm a")
                      : row.scheduledAt
                        ? `Scheduled ${format(new Date(row.scheduledAt), "d MMM yyyy, h:mm a")}`
                        : "—"}
                  </td>
                  <td className="px-3 py-2">{row.totalRecipients}</td>
                  <td className="px-3 py-2">{row.queuedCount}</td>
                  <td className="px-3 py-2 text-rose-700">{row.failedCount}</td>
                  <td className="px-3 py-2">{row.replyCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {drawerId && detail ? (
        <CampaignDrawer
          campaign={detail}
          onClose={() => {
            setDrawerId(null);
            setDetail(null);
          }}
          onLaunch={() => setLaunchConfirm(detail.id)}
        />
      ) : null}

      {createOpen ? (
        <CreateCampaignDrawer
          draft={draft}
          setDraft={setDraft}
          onClose={() => setCreateOpen(false)}
          onCsvFile={onCsvFile}
          onSave={(launch) => void saveCampaign(launch)}
        />
      ) : null}

      {launchConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-dark-primary">Launch campaign?</h3>
            <p className="mt-2 text-sm text-mid-green">
              Messages will not be sent to WhatsApp. Recipients will be recorded as queued (no
              provider connected).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLaunchConfirm(null)}
                className="px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void launchCampaign(launchConfirm)}
                className="rounded-full bg-mid-green px-4 py-2 text-sm font-medium text-white"
              >
                Launch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const tone =
    status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "FAILED"
        ? "bg-rose-100 text-rose-800"
        : status === "RUNNING"
          ? "bg-sky-100 text-sky-800"
          : "bg-dark-secondary/10 text-mid-green";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}

function CampaignDrawer({
  campaign,
  onClose,
  onLaunch,
}: {
  campaign: CampaignDetail;
  onClose: () => void;
  onLaunch: () => void;
}) {
  const canLaunch = ["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-dark-primary/35" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-[-12px_0_40px_rgba(11,43,38,0.18)]">
        <div className="flex items-start justify-between border-b border-dark-primary/8 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-dark-primary">{campaign.name}</h2>
            <StatusPill status={campaign.status} />
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-mid-green" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-dark-primary/8 px-5 py-3 text-center text-xs">
          {[
            ["Pending", campaign.pendingCount],
            ["Queued", campaign.queuedCount],
            ["Failed", campaign.failedCount],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="text-mid-green">{label as string}</p>
              <p className="text-lg font-semibold text-dark-primary">{val as number}</p>
            </div>
          ))}
        </div>
        {canLaunch ? (
          <div className="border-b border-dark-primary/8 px-5 py-3">
            <button
              type="button"
              onClick={onLaunch}
              className="w-full rounded-full bg-mid-green py-2 text-sm font-medium text-white"
            >
              Launch campaign
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-medium uppercase text-mid-green">Recipients</p>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-mid-green">
                <th className="pb-1">Phone</th>
                <th className="pb-1">Status</th>
                <th className="pb-1">Skip reason</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((r) => (
                <tr key={r.id} className="border-t border-dark-primary/6">
                  <td className="py-1.5">{r.phone}</td>
                  <td className="py-1.5">{r.status}</td>
                  <td className="py-1.5 text-mid-green">{r.skipReason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs font-medium uppercase text-mid-green">Message preview</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-dark-secondary/[0.06] p-3 text-xs text-dark-primary">
            {campaign.messageBody}
          </pre>
        </div>
      </aside>
    </div>
  );
}

function CreateCampaignDrawer({
  draft,
  setDraft,
  onClose,
  onCsvFile,
  onSave,
}: {
  draft: {
    name: string;
    messageBody: string;
    launchMode: "INSTANT" | "SCHEDULED";
    scheduledAt: string;
    recipientMode: "TELEMARKETING" | "LEADS" | "CSV";
    csvRows: Record<string, string>[];
    csvHeaders: string[];
    phoneColumn: string;
  };
  setDraft: Dispatch<SetStateAction<typeof draft>>;
  onClose: () => void;
  onCsvFile: (f: File) => void;
  onSave: (launch: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-dark-primary/35" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col bg-background shadow-[-12px_0_40px_rgba(11,43,38,0.18)]">
        <div className="flex items-center justify-between border-b border-dark-primary/8 px-5 py-4">
          <h2 className="text-lg font-semibold text-dark-primary">New campaign</h2>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <LaunchModeToggle
            mode={draft.launchMode}
            onChange={(m) => setDraft((d) => ({ ...d, launchMode: m }))}
          />
          <label className="block text-xs text-mid-green">
            Campaign name
            <input
              className={`${fieldClass} mt-1 w-full`}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
          {draft.launchMode === "SCHEDULED" ? (
            <label className="block text-xs text-mid-green">
              Scheduled time
              <input
                type="datetime-local"
                className={`${fieldClass} mt-1 w-full`}
                value={draft.scheduledAt}
                onChange={(e) => setDraft((d) => ({ ...d, scheduledAt: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="block text-xs text-mid-green">
            Message / template
            <textarea
              className="mt-1 w-full rounded-xl border border-dark-primary/10 p-3 text-sm"
              rows={4}
              value={draft.messageBody}
              onChange={(e) => setDraft((d) => ({ ...d, messageBody: e.target.value }))}
            />
            <span className="mt-1 block text-[11px]">{CAMPAIGN_TEMPLATE_HINT}</span>
          </label>
          <label className="block text-xs text-mid-green">
            Recipients from
            <select
              className={`${fieldClass} mt-1 w-full`}
              value={draft.recipientMode}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  recipientMode: e.target.value as typeof draft.recipientMode,
                }))
              }
            >
              <option value="TELEMARKETING">Telemarketing contacts</option>
              <option value="LEADS">Leads</option>
              <option value="CSV">CSV upload</option>
            </select>
          </label>
          {draft.recipientMode === "CSV" ? (
            <label className="flex cursor-pointer flex-col rounded-xl border border-dashed border-dark-primary/20 px-4 py-6 text-center text-xs text-mid-green">
              Upload CSV (phone column required)
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvFile(f);
                }}
              />
              {draft.csvRows.length > 0 ? (
                <span className="mt-2 text-dark-primary">{draft.csvRows.length} rows loaded</span>
              ) : null}
            </label>
          ) : (
            <p className="text-xs text-mid-green">
              All active {draft.recipientMode === "LEADS" ? "leads" : "telemarketing contacts"} with
              phone numbers will be included.
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-dark-primary/8 px-5 py-4">
          <button
            type="button"
            onClick={() => onSave(false)}
            className="flex-1 rounded-full border border-dark-primary/10 py-2 text-sm"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={!draft.name.trim() || !draft.messageBody.trim()}
            onClick={() => onSave(draft.launchMode === "INSTANT")}
            className="flex-1 rounded-full bg-mid-green py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {draft.launchMode === "INSTANT" ? "Launch" : "Schedule"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function LaunchModeToggle({
  mode,
  onChange,
}: {
  mode: "INSTANT" | "SCHEDULED";
  onChange: (m: "INSTANT" | "SCHEDULED") => void;
}) {
  return (
    <div className="flex rounded-full bg-dark-secondary/8 p-1 text-xs font-medium">
      {(["INSTANT", "SCHEDULED"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 rounded-full py-2 ${
            mode === m ? "bg-white text-dark-primary shadow-sm" : "text-mid-green"
          }`}
        >
          {m === "INSTANT" ? "Instant" : "Scheduled"}
        </button>
      ))}
    </div>
  );
}