"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/ui";

function cfgCreds(config: { hasCredentials: boolean }) {
  return config.hasCredentials ? "configured" : "missing";
}

type ReturnRow = {
  id: string;
  type: string;
  period: string;
  status: string;
  arn: string | null;
  summary: unknown;
};

type GstConfig = {
  enabled: boolean;
  provider: string;
  mode: string;
  hasCredentials: boolean;
  baseUrlConfigured: boolean;
  baseUrl?: string | null;
  einvoiceNicConfigured?: boolean;
  companyGstin: string | null;
  sellerState: string | null;
  workflow: {
    requireProformaBeforeTaxInvoice: boolean;
    requirePaymentBeforeTaxInvoice: boolean;
    paymentRule: string;
  };
};

type VerifyResult = {
  valid: boolean;
  gstin: string;
  legalName?: string;
  tradeName?: string;
  status?: string;
  stateName?: string;
  stateCode?: string;
  address?: string;
  message?: string;
  source?: string;
  partyName?: string;
};

export function GstWorkspace({
  returns,
  reconciliations,
  drafts,
  config,
}: {
  returns: ReturnRow[];
  reconciliations: Array<{ id: string; status: string; externalInvoiceRef: string | null }>;
  drafts: Array<{ id: string; type: string; status: string; createdAt: string }>;
  config: GstConfig;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [nl, setNl] = useState("");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  async function verifyGstin() {
    const value = gstin.trim().toUpperCase();
    if (value.length !== 15) return;
    setBusy("verify");
    setVerifyResult(null);
    setMessage("");
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_gstin",
          gstin: value,
          createPartyIfMissing: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "Verification failed");
      }
      const v = data.verification;
      if (!v) {
        throw new Error("No verification data returned");
      }
      const a = data.address as
        | {
            addressLine1?: string;
            addressLine2?: string;
            city?: string;
            state?: string;
            postalCode?: string;
          }
        | undefined;
      setVerifyResult({
        valid: v.valid,
        gstin: v.gstin,
        legalName: v.legalName,
        tradeName: v.tradeName,
        status: v.status,
        stateName: v.stateName,
        stateCode: v.stateCode,
        address:
          a
            ? [a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode].filter(Boolean).join(", ")
            : v.address,
        message: v.message,
        source: v.source,
        partyName: data.party?.legalName,
      });
    } catch (e) {
      setVerifyResult(null);
      setMessage(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage("");
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.verification?.message || "Failed");
      setMessage(JSON.stringify(data.summary || data.status || data.id || "OK"));
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl bg-white/40 p-4 text-sm space-y-2">
        <h2 className="text-lg font-medium">GST configuration</h2>
        <p className="text-mid-green">
          Seller GSTIN: <strong>{config.companyGstin || "—"}</strong> · State:{" "}
          {config.sellerState || "—"}
        </p>
        <p className="text-mid-green">
          GSP: {config.provider} / {config.mode} · Enabled: {config.enabled ? "yes" : "no"} ·
          Credentials: {cfgCreds(config)} · Host: {config.baseUrl || (config.baseUrlConfigured ? "set" : "local stubs")}
        </p>
        <p className="text-xs text-mid-green">
          E-invoice NIC user: {config.einvoiceNicConfigured ? "configured" : "not set (GSTIN verify still works)"}
        </p>
        <p className="text-xs text-mid-green">
          Workflow: proforma required → payment required → tax invoice (
          {config.workflow.paymentRule})
        </p>
      </section>

      <section className="rounded-xl bg-white/40 p-4 space-y-3">
        <h2 className="text-lg font-medium">Verify counterparty GSTIN</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded border border-light-green/40 bg-background px-3 py-2 text-sm uppercase tracking-wide"
            placeholder="15-digit GSTIN"
            maxLength={15}
            value={gstin}
            onChange={(e) => {
              setGstin(e.target.value.toUpperCase());
              setVerifyResult(null);
            }}
          />
          <button
            type="button"
            disabled={!!busy || gstin.trim().length !== 15}
            onClick={verifyGstin}
            className="rounded-lg bg-mid-green px-3 py-2 text-sm text-background"
          >
            {busy === "verify" ? "Verifying…" : "Verify GSTIN"}
          </button>
        </div>
        {verifyResult ? (
          <div
            className={`rounded-lg border p-3 text-sm space-y-1 ${
              verifyResult.valid
                ? "border-light-green/40 bg-light-green/15"
                : "border-dark-primary/30 bg-white/60"
            }`}
          >
            <p className="font-medium">
              {verifyResult.valid ? "Valid GSTIN" : "Invalid GSTIN"} ·{" "}
              <span className="font-mono">{verifyResult.gstin}</span>
            </p>
            <p>
              <span className="text-mid-green">Legal name:</span> {verifyResult.legalName || "—"}
            </p>
            {verifyResult.tradeName ? (
              <p>
                <span className="text-mid-green">Trade name:</span> {verifyResult.tradeName}
              </p>
            ) : null}
            <p>
              <span className="text-mid-green">Status:</span> {verifyResult.status || "—"}
              {verifyResult.stateName || verifyResult.stateCode
                ? ` · ${verifyResult.stateName || verifyResult.stateCode}`
                : ""}
            </p>
            <p>
              <span className="text-mid-green">Address:</span> {verifyResult.address || "—"}
            </p>
            {verifyResult.message ? (
              <p className="text-xs text-mid-green">{verifyResult.message}</p>
            ) : null}
            {verifyResult.partyName ? (
              <p className="text-xs text-mid-green">
                Linked to client: {verifyResult.partyName}
              </p>
            ) : null}
          </div>
        ) : null}
        {message && !verifyResult ? (
          <p className="text-sm text-dark-primary">{message}</p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-xl bg-white/40 p-4 sm:grid-cols-3">
        <label className="text-sm">
          Return period (YYYY-MM)
          <input
            className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => post({ action: "prepare_gstr1", period }, "gstr1")}
            className="rounded-lg bg-mid-green px-3 py-2 text-sm text-background"
          >
            Prepare GSTR-1
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => post({ action: "prepare_gstr3b", period }, "gstr3b")}
            className="rounded-lg border border-mid-green/40 px-3 py-2 text-sm"
          >
            Prepare GSTR-3B
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Returns</h2>
        <ul className="space-y-2 rounded-xl bg-white/40 p-4 text-sm">
          {returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {r.type} · {r.period} <StatusBadge status={r.status} />
                {r.arn ? ` · ${r.arn}` : ""}
              </span>
              {r.status === "PREPARED" || r.status === "VALIDATED" ? (
                <button
                  type="button"
                  disabled={!!busy}
                  className="rounded border border-dark-primary/30 px-2 py-1 text-xs"
                  onClick={() =>
                    post({ action: "file_return", gstReturnId: r.id, approved: true }, `file-${r.id}`)
                  }
                >
                  Approve &amp; file
                </button>
              ) : null}
            </li>
          ))}
          {returns.length === 0 ? <li className="text-mid-green">No return drafts yet</li> : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">GSTR-2B reconciliation</h2>
        <ul className="space-y-2 rounded-xl bg-white/40 p-4 text-sm">
          {reconciliations.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span>{r.externalInvoiceRef || r.id}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
          {reconciliations.length === 0 ? (
            <li className="text-mid-green">Import 2B rows via API action import_gstr2b</li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Natural language draft</h2>
        <div className="rounded-xl bg-white/40 p-4">
          <textarea
            className="w-full rounded border border-light-green/40 bg-background px-3 py-2 text-sm"
            rows={3}
            placeholder="e.g. sold 2 CCTV-CAM-DOME to Acme"
            value={nl}
            onChange={(e) => setNl(e.target.value)}
          />
          <button
            type="button"
            disabled={!!busy || nl.trim().length < 3}
            onClick={() => post({ action: "nl_draft", text: nl }, "nl")}
            className="mt-2 rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background"
          >
            Create draft
          </button>
          <ul className="mt-3 space-y-1 text-sm text-mid-green">
            {drafts.map((d) => (
              <li key={d.id}>
                {d.type} · <StatusBadge status={d.status} /> · {d.createdAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {message ? <p className="text-sm text-dark-primary break-all">{message}</p> : null}
    </div>
  );
}
