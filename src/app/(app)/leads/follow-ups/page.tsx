"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { LEAD_STAGE_LABELS } from "@/lib/leads/constants";

type FollowUp = {
  id: string;
  type: string;
  status: string;
  dueAt: string;
  title: string;
  notes: string;
  rfq: {
    id: string;
    leadNumber: string;
    customerName: string;
    customerCompany: string;
    leadStage: string;
    priority: string;
  };
  assignedTo: { id: string; name: string; email: string } | null;
};

export default function FollowUpsPage() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [scope, setScope] = useState("pending");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/follow-ups?scope=${scope}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(id: string) {
    const leadId = items.find((i) => i.id === id)?.rfq.id;
    if (!leadId) return;
    await fetch(`/api/leads/${leadId}/follow-ups`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpId: id }),
    });
    await load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-dark-primary">
            Follow-ups & Activities
          </h1>
          <p className="text-sm text-mid-green">
            Today&apos;s pending work and overdue reminders
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-dark-secondary/[0.05] p-1">
          {[
            ["pending", "Pending"],
            ["today", "Today"],
            ["overdue", "Overdue"],
            ["all", "All"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                scope === value
                  ? "bg-dark-primary text-background"
                  : "text-dark-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-dark-primary/8 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-dark-secondary/[0.04] text-xs uppercase text-mid-green">
            <tr>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">Lead</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2 text-left">Assignee</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-mid-green">
                  No follow-ups in this view.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-dark-primary/5">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format(new Date(item.dueAt), "dd MMM yyyy HH:mm")}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/leads/${item.rfq.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.rfq.leadNumber}
                    </Link>
                    <div className="text-xs text-mid-green">
                      {item.rfq.customerCompany || item.rfq.customerName}
                      {" · "}
                      {LEAD_STAGE_LABELS[
                        item.rfq.leadStage as keyof typeof LEAD_STAGE_LABELS
                      ] || item.rfq.leadStage}
                    </div>
                  </td>
                  <td className="px-3 py-2">{item.type}</td>
                  <td className="px-3 py-2">{item.title || item.notes || "—"}</td>
                  <td className="px-3 py-2">
                    {item.assignedTo?.name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        item.status === "OVERDUE"
                          ? "text-red-600"
                          : "text-mid-green"
                      }
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {item.status === "PENDING" || item.status === "OVERDUE" ? (
                      <button
                        type="button"
                        onClick={() => void complete(item.id)}
                        className="text-xs text-mid-green hover:underline"
                      >
                        Complete
                      </button>
                    ) : (
                      "—"
                    )}
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
