"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Inline GSTIN onboarding when a tax invoice needs a client GSTIN.
 */
export function ClientGstinGate({
  partyId,
  partyName,
  onLinked,
}: {
  partyId: string;
  partyName: string;
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState<"fetch" | "save" | null>(null);
  const [preview, setPreview] = useState<{
    legalName?: string;
    tradeName?: string;
    address?: string;
    status?: string;
    message?: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function fetchPortal() {
    const value = gstin.trim().toUpperCase();
    if (value.length !== 15) {
      setError("Enter a valid 15-character GSTIN");
      return;
    }
    setBusy("fetch");
    setError("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "gstin", gstin: value, save: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.verification?.message || "Lookup failed");
      const v = data.verification;
      const a = data.address;
      setPreview({
        legalName: v.legalName,
        tradeName: v.tradeName,
        status: v.status,
        address: a
          ? [a.addressLine1, a.city, a.state, a.postalCode].filter(Boolean).join(", ")
          : v.address,
        message: v.message,
      });
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function linkToClient() {
    const value = gstin.trim().toUpperCase();
    if (value.length !== 15) {
      setError("Enter a valid 15-character GSTIN");
      return;
    }
    setBusy("save");
    setError("");
    try {
      // Attach verified GSTIN (+ address) to this party
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_gstin",
          gstin: value,
          partyId,
          createPartyIfMissing: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.verification?.valid) {
        throw new Error(data.error || data.verification?.message || "Could not link GSTIN");
      }
      onLinked?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save GSTIN");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-dark-primary/20 bg-white/60 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-dark-primary">Client GSTIN required</h3>
        <p className="mt-1 text-xs text-mid-green">
          Tax invoices need a GSTIN on <strong>{partyName}</strong>. Fetch details from the GST
          portal, or{" "}
          <Link href="/clients" className="underline">
            open Clients onboarding
          </Link>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="15-character GSTIN"
          className="min-w-[220px] flex-1 rounded border border-light-green/40 bg-background px-2 py-1.5 font-mono text-sm"
        />
        <button
          type="button"
          disabled={!!busy || gstin.trim().length !== 15}
          onClick={fetchPortal}
          className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm hover:bg-mid-green/10 disabled:opacity-50"
        >
          {busy === "fetch" ? "Fetching…" : "Fetch from portal"}
        </button>
        <button
          type="button"
          disabled={!!busy || gstin.trim().length !== 15}
          onClick={linkToClient}
          className="rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save GSTIN & continue"}
        </button>
      </div>
      {preview ? (
        <div className="rounded-lg bg-light-green/15 p-3 text-xs space-y-1">
          <p>
            <span className="text-mid-green">Legal name:</span> {preview.legalName || "—"}
          </p>
          <p>
            <span className="text-mid-green">Status:</span> {preview.status || "—"}
          </p>
          <p>
            <span className="text-mid-green">Address:</span> {preview.address || "—"}
          </p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
    </div>
  );
}
