"use client";

import { useEffect, useState } from "react";
import { LEAD_CHANNEL_LABELS } from "@/lib/leads/constants";

type Row = { channel: string; count: number; won: number };

export default function LeadSourcesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/leads/kpis")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.sourcePerformance) ? d.sourcePerformance : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-dark-primary">Lead Sources</h1>
        <p className="text-sm text-mid-green">
          Acquisition mix across Outlook, WhatsApp, website, referral, import, and more
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-dark-primary/8 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-dark-secondary/[0.04] text-xs uppercase text-mid-green">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Won</th>
              <th className="px-3 py-2 text-right">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-mid-green">
                  No source data yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.channel} className="border-t border-dark-primary/5">
                  <td className="px-3 py-2">
                    {LEAD_CHANNEL_LABELS[
                      row.channel as keyof typeof LEAD_CHANNEL_LABELS
                    ] || row.channel}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.won}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.count
                      ? `${Math.round((row.won / row.count) * 1000) / 10}%`
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
