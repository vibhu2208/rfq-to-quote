"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessageFromJson, readJsonResponse } from "@/lib/http";
import { ClientGstinGate } from "@/components/client-gstin-gate";

export function ProformaActions({
  id,
  status,
  amountPaid,
  total,
  partyId,
  partyName,
  partyGstin,
}: {
  id: string;
  status: string;
  amountPaid: number;
  total: number;
  partyId: string;
  partyName: string;
  partyGstin: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [payAmount, setPayAmount] = useState(
    amountPaid > 0 ? String(Math.max(0, total - amountPaid) || total) : String(total || "")
  );
  const [gstinCode, setGstinCode] = useState<string | null>(null);

  const hasGstin = Boolean((partyGstin || "").trim());
  const needsGstinGate = !hasGstin;
  const canConvert = amountPaid > 0 && hasGstin && !needsGstinGate;

  async function run(action: "issue" | "convert" | "record_payment") {
    if (action === "convert" && !hasGstin) {
      setError("Add the client GSTIN before creating the tax invoice.");
      setGstinCode("CLIENT_GSTIN_REQUIRED");
      return;
    }
    setBusy(action);
    setError("");
    setGstinCode(null);
    try {
      const body =
        action === "record_payment"
          ? { action, amount: Number(payAmount), method: "BANK_TRANSFER" }
          : { action };

      const res = await fetch(`/api/proformas/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data, parseError } = await readJsonResponse<{
        id?: string;
        error?: string;
        code?: string;
      }>(res);
      if (!res.ok) {
        const code =
          data && typeof data === "object" && "code" in data
            ? String((data as { code?: string }).code || "")
            : "";
        if (code === "CLIENT_GSTIN_REQUIRED") setGstinCode(code);
        throw new Error(errorMessageFromJson(data, parseError || `Request failed (${res.status})`));
      }
      if (action === "convert" && data?.id) {
        router.push(`/invoices/${data.id}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {needsGstinGate || gstinCode === "CLIENT_GSTIN_REQUIRED" ? (
        <ClientGstinGate
          partyId={partyId}
          partyName={partyName}
          onLinked={() => {
            setGstinCode(null);
            setError("");
            router.refresh();
          }}
        />
      ) : (
        <p className="text-xs text-mid-green">
          Client GSTIN: <span className="font-mono">{partyGstin}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("issue")}
            className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm hover:bg-mid-green/10"
          >
            {busy === "issue" ? "Issuing…" : "Issue proforma"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!!busy || !canConvert}
          onClick={() => run("convert")}
          title={
            !hasGstin
              ? "Add client GSTIN first"
              : canConvert
                ? "Create GST tax invoice"
                : "Record payment first"
          }
          className="rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
        >
          {busy === "convert" ? "Converting…" : "Convert to tax invoice"}
        </button>
      </div>

      {status !== "DRAFT" && status !== "CANCELLED" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-light-green/30 bg-white/50 p-3">
          <label className="text-sm">
            Record payment
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="mt-1 block w-40 rounded border border-light-green/40 bg-background px-2 py-1.5"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!!busy || !Number(payAmount)}
            onClick={() => run("record_payment")}
            className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm hover:bg-mid-green/10"
          >
            {busy === "record_payment" ? "Saving…" : "Save payment"}
          </button>
          <p className="w-full text-xs text-mid-green">
            Paid {amountPaid.toFixed(2)} of {total.toFixed(2)}. Tax invoice needs payment + client
            GSTIN.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
    </div>
  );
}
