"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessageFromJson, readJsonResponse } from "@/lib/http";
import { ClientGstinGate } from "@/components/client-gstin-gate";

export function InvoiceActions({
  invoiceId,
  status,
  partyId,
  partyName,
  partyGstin,
}: {
  invoiceId: string;
  status: string;
  partyId: string;
  partyName: string;
  partyGstin: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const hasGstin = Boolean((partyGstin || "").trim());
  const blockIssue = status === "DRAFT" && !hasGstin;

  async function run(action: string, body?: Record<string, unknown>) {
    if (action === "issue" && !hasGstin) {
      setError("Add the client GSTIN before issuing the tax invoice.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      if (action === "pdf") {
        const res = await fetch(`/api/invoices/${invoiceId}/pdf`);
        if (!res.ok) {
          const { data, parseError } = await readJsonResponse(res);
          throw new Error(errorMessageFromJson(data, parseError || "PDF generation failed"));
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const opened = window.open(url, "_blank");
        if (!opened) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `invoice-${invoiceId}.pdf`;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      if (action === "einvoice") {
        const res = await fetch("/api/gst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "einvoice", invoiceId, approved: true }),
        });
        const { data, parseError } = await readJsonResponse<{
          irn?: string;
          responsePayload?: { message?: string };
          error?: string;
        }>(res);
        if (!res.ok) {
          throw new Error(errorMessageFromJson(data, parseError || "E-invoice failed"));
        }
        alert(data?.irn ? `IRN: ${data.irn}` : data?.responsePayload?.message || "Submitted");
        router.refresh();
        return;
      }
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data, parseError } = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(errorMessageFromJson(data, parseError || "Action failed"));
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {blockIssue ? (
        <ClientGstinGate
          partyId={partyId}
          partyName={partyName}
          onLinked={() => {
            setError("");
            router.refresh();
          }}
        />
      ) : hasGstin ? (
        <p className="text-xs text-mid-green">
          Client GSTIN: <span className="font-mono">{partyGstin}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <button
            type="button"
            disabled={!!busy || blockIssue}
            onClick={() => run("issue", { action: "issue" })}
            className="rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
          >
            {busy === "issue" ? "Issuing…" : "Issue invoice"}
          </button>
        ) : null}
        {status !== "CANCELLED" && status !== "VOID" ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              const reason = window.prompt("Cancellation reason");
              if (reason) run("cancel", { action: "cancel", reason });
            }}
            className="rounded-lg border border-dark-primary/20 px-3 py-1.5 text-sm hover:bg-dark-primary/10 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("pdf")}
          className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm hover:bg-mid-green/10"
        >
          PDF
        </button>
        {status !== "DRAFT" ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("einvoice")}
            className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm hover:bg-mid-green/10"
          >
            Approve e-invoice
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
    </div>
  );
}
