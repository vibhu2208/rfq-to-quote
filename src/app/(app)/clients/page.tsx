"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, Search, X } from "lucide-react";

type BillingAddress = {
  id?: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  district?: string | null;
  state: string;
  stateCode: string;
  postalCode: string;
};

type Client = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  placeOfSupplyCode: string | null;
  gstinVerifiedAt: string | null;
  gstinStatus: string | null;
  active: boolean;
  billingAddress: BillingAddress | null;
};

type Preview = {
  legalName: string;
  tradeName: string;
  status: string;
  stateName: string;
  stateCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  message: string;
};

const emptyPreview = (): Preview => ({
  legalName: "",
  tradeName: "",
  status: "",
  stateName: "",
  stateCode: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  message: "",
});

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [gstin, setGstin] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<Preview>(emptyPreview());
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ active: "true" });
    if (q) params.set("q", q);
    const res = await fetch(`/api/parties?${params}`);
    const data = await res.json();
    setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openOnboard() {
    setGstin("");
    setEmail("");
    setPhone("");
    setPreview(emptyPreview());
    setMessage("");
    setModalOpen(true);
  }

  async function fetchFromPortal() {
    const value = gstin.trim().toUpperCase();
    if (value.length !== 15) {
      setMessage("Enter a valid 15-character GSTIN");
      return;
    }
    setFetching(true);
    setMessage("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "gstin", gstin: value, save: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "Lookup failed");
      }
      const v = data.verification;
      const a = data.address || {};
      setPreview({
        legalName: v.legalName || "",
        tradeName: v.tradeName || "",
        status: v.status || "",
        stateName: v.stateName || "",
        stateCode: v.stateCode || "",
        addressLine1: a.addressLine1 || v.address || "",
        addressLine2: a.addressLine2 || "",
        city: a.city || "",
        state: a.state || v.stateName || "",
        postalCode: a.postalCode || "",
        message: v.message || "Fetched from GST portal via Sandbox",
      });
      setMessage(v.message || "Details fetched — review and save");
    } catch (e) {
      setPreview(emptyPreview());
      setMessage(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setFetching(false);
    }
  }

  async function saveClient(e: FormEvent) {
    e.preventDefault();
    const value = gstin.trim().toUpperCase();
    if (value.length !== 15) {
      setMessage("Enter a valid 15-character GSTIN");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "gstin",
          gstin: value,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          save: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "Save failed");
      }
      setModalOpen(false);
      setMessage(`Saved ${data.party?.legalName || value}`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function reverify(client: Client) {
    if (!client.gstin) return;
    setMessage("Re-verifying…");
    const res = await fetch(`/api/parties/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reverifyGstin: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Re-verify failed");
      return;
    }
    setMessage(`Updated ${data.legalName} from portal`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-sm text-mid-green">
            Onboard buyers with GSTIN — legal name and address pull from the GST portal
          </p>
        </div>
        <button
          type="button"
          onClick={openOnboard}
          className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Onboard client
        </button>
      </div>

      {message && !modalOpen ? <p className="text-sm text-mid-green">{message}</p> : null}

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green"
          strokeWidth={1.5}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, GSTIN, code…"
          className="w-full rounded-lg border border-light-green/40 bg-white/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
        />
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">GSTIN</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No clients yet. Onboard one with their GSTIN.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-t border-light-green/20">
                  <td className="px-4 py-3 font-medium">{c.code}</td>
                  <td className="px-4 py-3">
                    <div>{c.legalName}</div>
                    {c.tradeName && c.tradeName !== c.legalName ? (
                      <div className="text-xs text-mid-green">{c.tradeName}</div>
                    ) : null}
                    {c.email ? <div className="text-xs text-mid-green">{c.email}</div> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.gstin || "—"}</td>
                  <td className="px-4 py-3 text-xs text-mid-green max-w-xs">
                    {c.billingAddress
                      ? [
                          c.billingAddress.addressLine1,
                          c.billingAddress.city,
                          c.billingAddress.state,
                          c.billingAddress.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded px-2 py-0.5 text-xs bg-mid-green/20 text-mid-green">
                      {c.gstinStatus || (c.gstinVerifiedAt ? "Verified" : "Unverified")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.gstin ? (
                      <button
                        type="button"
                        onClick={() => reverify(c)}
                        className="inline-flex items-center gap-1 rounded p-1.5 text-mid-green hover:bg-light-green/30"
                        title="Refresh from GST portal"
                      >
                        <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <form
            onSubmit={saveClient}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-mid-green" strokeWidth={1.5} />
                  Onboard client
                </h2>
                <p className="mt-1 text-xs text-mid-green">
                  Enter GSTIN → fetch from portal → save customer master
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-mid-green">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">GSTIN</span>
                <div className="flex gap-2">
                  <input
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    maxLength={15}
                    placeholder="15-character GSTIN"
                    className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 font-mono text-sm outline-none focus:border-mid-green"
                    required
                  />
                  <button
                    type="button"
                    onClick={fetchFromPortal}
                    disabled={fetching || gstin.trim().length !== 15}
                    className="shrink-0 rounded-lg border border-mid-green/40 px-3 py-2 text-sm hover:bg-mid-green/10 disabled:opacity-50"
                  >
                    {fetching ? "Fetching…" : "Fetch"}
                  </button>
                </div>
              </label>

              {preview.legalName || preview.addressLine1 ? (
                <div className="rounded-lg border border-light-green/30 bg-white/50 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-mid-green">Legal name:</span> {preview.legalName || "—"}
                  </p>
                  <p>
                    <span className="text-mid-green">Trade name:</span> {preview.tradeName || "—"}
                  </p>
                  <p>
                    <span className="text-mid-green">Status:</span> {preview.status || "—"} ·{" "}
                    {preview.stateName || preview.stateCode || ""}
                  </p>
                  <p>
                    <span className="text-mid-green">Address:</span>{" "}
                    {[preview.addressLine1, preview.addressLine2, preview.city, preview.state, preview.postalCode]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Contact email (optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Phone (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
            </div>

            {message ? <p className="mt-3 text-sm text-dark-primary">{message}</p> : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-mid-green hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || gstin.trim().length !== 15}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save client"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
