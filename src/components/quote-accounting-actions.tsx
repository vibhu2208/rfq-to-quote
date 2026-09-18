"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessageFromJson, readJsonResponse } from "@/lib/http";

export function QuoteAccountingActions({
  quoteId,
  status,
}: {
  quoteId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canConvert = ["ACCEPTED", "SENT", "INVOICE_GENERATED", "UNDER_NEGOTIATION"].includes(status);

  async function createProforma() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/proformas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const { data, parseError } = await readJsonResponse<{ id?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(errorMessageFromJson(data, parseError || `Request failed (${res.status})`));
      }
      if (!data?.id) throw new Error("Proforma created but no id returned");
      router.push(`/proformas/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canConvert) return null;

  return (
    <div className="rounded-xl border border-light-green/30 bg-white/40 p-4">
      <h3 className="text-sm font-semibold">Accounting</h3>
      <p className="mt-1 text-xs text-mid-green">
        Flow: proforma (dummy) → record payment → GST tax invoice. Direct tax invoices from quotes are
        blocked.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={createProforma}
          className="rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create proforma"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-dark-primary">{error}</p> : null}
    </div>
  );
}
