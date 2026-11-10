"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

export type ClientGstLookupSeed = {
  partyId?: string;
  legalName?: string | null;
  tradeName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  postalCode?: string | null;
};

type GstPreview = {
  gstin: string;
  legalName?: string;
  tradeName?: string;
  status?: string;
  address?: string;
  stateName?: string;
  message?: string;
};

type PanHit = {
  gstin: string;
  legalName?: string;
  tradeName?: string;
  status?: string;
  score: number;
  matchReasons: string[];
};

function formatAddress(parts: {
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return [parts.addressLine1, parts.city, parts.state, parts.postalCode]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(", ");
}

function panFromGstin(gstin: string | null | undefined) {
  const value = (gstin || "").trim().toUpperCase();
  if (value.length !== 15) return "";
  return value.slice(2, 12);
}

/**
 * Bidirectional GST enrichment for clients:
 * - GSTIN → preview name/address (confirm before DB write)
 * - Name/address (+ PAN) → search GSTINs, preview, then confirm apply
 */
export function ClientGstLookupDialog({
  seed,
  mode = "enrich",
  onClose,
  onApplied,
  onPreviewOnly,
}: {
  seed: ClientGstLookupSeed;
  /** enrich = may write after confirm; preview = fill form fields only */
  mode?: "enrich" | "preview";
  onClose: () => void;
  onApplied?: (partyName: string) => void;
  onPreviewOnly?: (preview: {
    gstin: string;
    legalName?: string;
    tradeName?: string;
    status?: string;
    stateName?: string;
    stateCode?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    district?: string;
    state?: string;
    postalCode?: string;
  }) => void;
}) {
  const seedGstin = (seed.gstin || "").trim().toUpperCase();
  const seedPan = (seed.pan || "").trim().toUpperCase() || panFromGstin(seedGstin);
  const seedName = (seed.legalName || seed.tradeName || "").trim();
  const seedAddress = formatAddress(seed);
  const seedStateCode = (seed.stateCode || "").trim();

  const [gstin, setGstin] = useState(seedGstin);
  const [pan, setPan] = useState(seedPan);
  const [nameHint, setNameHint] = useState(seedName);
  const [addressHint, setAddressHint] = useState(seedAddress);
  const [stateCode, setStateCode] = useState(seedStateCode);
  const [busy, setBusy] = useState<"gstin" | "pan" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<GstPreview | null>(null);
  const [rawAddress, setRawAddress] = useState<{
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    district?: string;
    state?: string;
    stateCode?: string;
    postalCode?: string;
  } | null>(null);
  const [hits, setHits] = useState<PanHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<string>("");

  const canApply = Boolean(preview?.gstin && (mode === "preview" || seed.partyId));

  const confirmSummary = useMemo(() => {
    if (!preview) return [];
    const rows: { label: string; from: string; to: string; changed: boolean }[] = [];
    const push = (label: string, from: string | null | undefined, to: string | undefined) => {
      const a = (from || "").trim();
      const b = (to || "").trim();
      if (!b) return;
      rows.push({ label, from: a || "—", to: b, changed: Boolean(a) && a !== b });
    };
    push("GSTIN", seed.gstin, preview.gstin);
    push("Legal name", seed.legalName, preview.legalName);
    push("Trade name", seed.tradeName, preview.tradeName);
    push("Address", seedAddress, preview.address);
    return rows;
  }, [preview, seed, seedAddress]);

  async function fetchByGstin(value?: string) {
    const next = (value || gstin).trim().toUpperCase();
    if (next.length !== 15) {
      setError("Enter a valid 15-character GSTIN");
      return;
    }
    setBusy("gstin");
    setError("");
    setMessage("");
    setHits([]);
    setSelectedHit("");
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_gstin", gstin: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "Lookup failed");
      }
      const v = data.verification || {};
      const a = data.address || null;
      const addressText = a
        ? [a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode]
            .filter(Boolean)
            .join(", ")
        : v.address;
      setGstin(next);
      setRawAddress(a);
      setPreview({
        gstin: next,
        legalName: v.legalName,
        tradeName: v.tradeName,
        status: v.status,
        address: addressText,
        stateName: v.stateName || a?.state,
        message: v.message,
      });
      setMessage(v.message || "Portal details ready — review before saving");
    } catch (e) {
      setPreview(null);
      setRawAddress(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function searchByPan() {
    const nextPan = pan.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(nextPan)) {
      setError(
        "GST portal cannot search by name alone. Enter the 10-character PAN (often known from invoices), then we match name/address."
      );
      return;
    }
    setBusy("pan");
    setError("");
    setMessage("");
    setPreview(null);
    setRawAddress(null);
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_by_pan",
          pan: nextPan,
          stateCode: stateCode.trim() || undefined,
          nameHint: nameHint.trim() || undefined,
          addressHint: addressHint.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PAN search failed");
      const list: PanHit[] = Array.isArray(data.hits) ? data.hits : [];
      setHits(list);
      if (list.length === 0) {
        setMessage(data.message || "No GSTIN found for this PAN");
        return;
      }
      setSelectedHit(list[0].gstin);
      setMessage(
        data.message ||
          `Found ${list.length} GSTIN(s). Pick one, fetch full details, then confirm.`
      );
    } catch (e) {
      setHits([]);
      setError(e instanceof Error ? e.message : "PAN search failed");
    } finally {
      setBusy(null);
    }
  }

  async function applyChanges() {
    if (!preview?.gstin) return;

    if (mode === "preview") {
      onPreviewOnly?.({
        gstin: preview.gstin,
        legalName: preview.legalName,
        tradeName: preview.tradeName,
        status: preview.status,
        stateName: preview.stateName,
        stateCode: rawAddress?.stateCode || preview.gstin.slice(0, 2),
        addressLine1: rawAddress?.addressLine1 || preview.address,
        addressLine2: rawAddress?.addressLine2,
        city: rawAddress?.city,
        district: rawAddress?.district,
        state: rawAddress?.state || preview.stateName,
        postalCode: rawAddress?.postalCode,
      });
      onClose();
      return;
    }

    if (!seed.partyId) {
      setError("Missing client id");
      return;
    }

    const ok = window.confirm(
      "Update this client in the database with the portal details shown?\n\nName, trade name, GSTIN, and billing address may change."
    );
    if (!ok) return;

    setBusy("apply");
    setError("");
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_gstin",
          gstin: preview.gstin,
          partyId: seed.partyId,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.verification?.valid) {
        throw new Error(data.error || data.verification?.message || "Could not save");
      }
      onApplied?.(data.party?.legalName || preview.legalName || preview.gstin);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-light-green/20 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-dark-primary">GST portal lookup</h2>
            <p className="mt-1 text-xs text-mid-green">
              Fetch from GSTIN, or find GSTIN via PAN using name/address to rank matches. Nothing is
              saved until you confirm.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-mid-green" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
              Have GSTIN → fetch details
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="15-character GSTIN"
                className="min-w-[220px] flex-1 rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 font-mono text-sm outline-none focus:border-mid-green"
              />
              <button
                type="button"
                disabled={!!busy || gstin.trim().length !== 15}
                onClick={() => void fetchByGstin()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-mid-green/40 px-3 py-2 text-sm hover:bg-mid-green/10 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                {busy === "gstin" ? "Fetching…" : "Fetch details"}
              </button>
            </div>
          </section>

          <section className="space-y-2 border-t border-light-green/20 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
              Have name / address → find GSTIN
            </h3>
            <p className="text-[11px] leading-snug text-mid-green">
              Official GST APIs search by PAN (not free-text name). We use your name and address to
              score the GSTINs returned for that PAN.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                  Name hint
                </span>
                <input
                  value={nameHint}
                  onChange={(e) => setNameHint(e.target.value)}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 text-sm outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                  Address hint
                </span>
                <input
                  value={addressHint}
                  onChange={(e) => setAddressHint(e.target.value)}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 text-sm outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                  PAN *
                </span>
                <input
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="ABCDE1234F"
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 font-mono text-sm outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                  State code (optional)
                </span>
                <input
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  maxLength={2}
                  placeholder="27"
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 font-mono text-sm outline-none focus:border-mid-green"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!!busy || pan.trim().length !== 10}
              onClick={() => void searchByPan()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-mid-green/40 px-3 py-2 text-sm hover:bg-mid-green/10 disabled:opacity-50"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
              {busy === "pan" ? "Searching…" : "Find GSTIN"}
            </button>

            {hits.length > 0 ? (
              <div className="space-y-2 rounded-lg bg-light-green/10 p-3">
                {hits.map((hit) => (
                  <label
                    key={hit.gstin}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/50"
                  >
                    <input
                      type="radio"
                      name="gstin-hit"
                      checked={selectedHit === hit.gstin}
                      onChange={() => setSelectedHit(hit.gstin)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-mono text-xs">{hit.gstin}</span>
                      <span className="mt-0.5 block truncate">
                        {hit.legalName || hit.tradeName || "—"}
                        {hit.status ? ` · ${hit.status}` : ""}
                      </span>
                      {hit.matchReasons.length ? (
                        <span className="mt-0.5 block text-[11px] text-mid-green">
                          {hit.matchReasons.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  disabled={!!busy || !selectedHit}
                  onClick={() => void fetchByGstin(selectedHit)}
                  className="rounded-lg bg-mid-green px-3 py-1.5 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
                >
                  Fetch details for selected
                </button>
              </div>
            ) : null}
          </section>

          {preview ? (
            <section className="space-y-2 border-t border-light-green/20 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
                Preview — confirm before {mode === "preview" ? "applying to form" : "updating DB"}
              </h3>
              <div className="rounded-lg bg-white/60 p-3 text-sm space-y-1">
                <p>
                  <span className="text-mid-green">GSTIN:</span>{" "}
                  <span className="font-mono">{preview.gstin}</span>
                </p>
                <p>
                  <span className="text-mid-green">Legal name:</span> {preview.legalName || "—"}
                </p>
                <p>
                  <span className="text-mid-green">Trade name:</span> {preview.tradeName || "—"}
                </p>
                <p>
                  <span className="text-mid-green">Status:</span> {preview.status || "—"}
                </p>
                <p>
                  <span className="text-mid-green">Address:</span> {preview.address || "—"}
                </p>
              </div>
              {confirmSummary.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-light-green/30 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-light-green/15 text-mid-green">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Field</th>
                        <th className="px-3 py-1.5 font-medium">Current</th>
                        <th className="px-3 py-1.5 font-medium">Portal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmSummary.map((row) => (
                        <tr key={row.label} className="border-t border-light-green/20">
                          <td className="px-3 py-1.5">{row.label}</td>
                          <td className="px-3 py-1.5 text-mid-green">{row.from}</td>
                          <td
                            className={`px-3 py-1.5 ${row.changed ? "font-medium text-dark-primary" : ""}`}
                          >
                            {row.to}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {message ? <p className="text-xs text-mid-green">{message}</p> : null}
          {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-light-green/20 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-mid-green hover:bg-light-green/20"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!!busy || !canApply}
            onClick={() => void applyChanges()}
            className="rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
          >
            {busy === "apply"
              ? "Saving…"
              : mode === "preview"
                ? "Apply to form"
                : "Confirm & update client"}
          </button>
        </div>
      </div>
    </div>
  );
}
