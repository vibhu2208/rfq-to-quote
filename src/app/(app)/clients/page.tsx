"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { MasterDetailDialog } from "@/components/master-detail-dialog";
import { ClientOnboardDialog } from "@/components/client-onboard-dialog";
import {
  ClientContactsEditor,
  type ClientContact,
} from "@/components/client-contacts-editor";

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
  pan?: string | null;
  email: string | null;
  phone: string | null;
  phone2?: string | null;
  website?: string | null;
  placeOfSupplyCode: string | null;
  gstinVerifiedAt: string | null;
  gstinStatus: string | null;
  clientTypeName?: string | null;
  sourceClientId?: string | null;
  ledgerGroup?: string | null;
  managedByName?: string | null;
  masterData?: Record<string, unknown> | null;
  active: boolean;
  billingAddress: BillingAddress | null;
  contacts?: ClientContact[];
};

function clientMasterFallback(c: Client): Record<string, unknown> {
  return {
    ClientID: c.sourceClientId || c.code,
    ClientName: c.legalName,
    ClientAccName: c.tradeName,
    ClientTypeName: c.clientTypeName,
    GSTIN: c.gstin,
    ClientPAN: c.pan,
    ClientEmail: c.email,
    ClientPhone1: c.phone,
    ClientPhone2: c.phone2,
    ClientWeb: c.website,
    CityName: c.billingAddress?.city,
    StateName: c.billingAddress?.state,
    ClientAddress: c.billingAddress?.addressLine1,
    ClientPinCode: c.billingAddress?.postalCode,
    LedgerGroupName: c.ledgerGroup,
    ManageName: c.managedByName,
  };
}

function hasMasterFields(data: unknown): data is Record<string, unknown> {
  return Boolean(data && typeof data === "object" && Object.keys(data as object).length > 0);
}

const PAGE_SIZE = 100;

const fieldClass =
  "h-9 shrink-0 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-[13px] text-dark-primary outline-none placeholder:text-mid-green/65 focus:bg-white focus:ring-1 focus:ring-mid-green/30";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [gst, setGst] = useState("");
  const [vendor, setVendor] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<Client | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      active: "true",
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (gst) params.set("gst", gst);
    if (vendor) params.set("vendor", vendor);
    const res = await fetch(`/api/parties?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setClients(data);
      setTotal(data.length);
    } else {
      setClients(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      if (Array.isArray(data.types)) setTypes(data.types);
    }
    setLoading(false);
  }, [q, page, type, gst, vendor]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function openDetail(client: Client) {
    setDetail(client);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/parties/${client.id}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
    } finally {
      setDetailLoading(false);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(q || type || gst || vendor);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
      <form
        onSubmit={(e) => e.preventDefault()}
        autoComplete="off"
        className="shrink-0 px-4 py-2.5"
      >
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-dark-primary">Clients</h1>
            <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-xs font-medium tabular-nums text-mid-green">
              {total}
            </span>
          </div>

          <div className="relative min-w-[8rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green/70"
              strokeWidth={1.5}
            />
            <input
              type="search"
              value={q}
              autoComplete="off"
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, GSTIN, client ID, type…"
              aria-label="Search clients"
              className="h-9 w-full rounded-full border-0 bg-dark-secondary/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-mid-green/60 focus:bg-white focus:ring-1 focus:ring-mid-green/30"
            />
          </div>

          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            aria-label="Client type"
            className={`${fieldClass} max-w-[11rem]`}
          >
            <option value="">Type</option>
            {types.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={gst}
            onChange={(e) => {
              setGst(e.target.value);
              setPage(1);
            }}
            aria-label="GST"
            className={`${fieldClass} w-[6.5rem]`}
          >
            <option value="">GST</option>
            <option value="yes">With GST</option>
            <option value="no">Without GST</option>
          </select>

          <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-dark-secondary/[0.05] px-3 text-[13px] font-medium text-mid-green transition hover:bg-light-green/20 has-[:checked]:bg-mid-green has-[:checked]:text-background">
            <input
              type="checkbox"
              checked={vendor === "1"}
              onChange={(e) => {
                setVendor(e.target.checked ? "1" : "");
                setPage(1);
              }}
              className="sr-only"
            />
            Vendor
          </label>

          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setType("");
                setGst("");
                setVendor("");
                setPage(1);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm text-mid-green hover:bg-light-green/15"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Clear
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setMessage("");
              setModalOpen(true);
            }}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Onboard
          </button>
        </div>
        {message && !modalOpen ? (
          <p className="mt-2 text-xs text-mid-green">{message}</p>
        ) : null}
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[7.5rem]" />
            <col />
            <col className="w-[8.5rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[8rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[3rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-t border-light-green/20 bg-[#fbfaf6] text-[10px] uppercase tracking-wide text-mid-green">
            <tr>
              <th className="px-3 py-2 font-medium">Client ID</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">GSTIN</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-sm text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-sm text-mid-green">
                  {filtered ? "No clients match these filters." : "No clients yet. Onboard a client to start."}
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                const primary = c.contacts?.find((x) => x.isPrimary) || c.contacts?.[0];
                const contactName = primary?.name || c.managedByName;
                const extra =
                  (c.contacts?.length || 0) > 1 ? ` +${(c.contacts?.length || 0) - 1}` : "";
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-light-green/15 hover:bg-light-green/10"
                    onClick={() => openDetail(c)}
                  >
                    <td className="px-3 py-2 align-middle font-medium">
                      {c.sourceClientId || c.code}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="block truncate">{c.legalName}</span>
                      {c.tradeName && c.tradeName !== c.legalName ? (
                        <span className="mt-0.5 block truncate text-xs text-mid-green">
                          {c.tradeName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="rounded px-2 py-0.5 text-xs bg-mid-green/20 text-mid-green">
                        {c.clientTypeName || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle font-mono text-xs">{c.gstin || "—"}</td>
                    <td className="truncate px-3 py-2 align-middle text-xs text-mid-green">
                      {[c.billingAddress?.city, c.billingAddress?.state].filter(Boolean).join(", ") ||
                        "—"}
                    </td>
                    <td className="px-3 py-2 align-middle text-xs">{c.phone || "—"}</td>
                    <td className="truncate px-3 py-2 align-middle text-xs">
                      {contactName ? `${contactName}${extra}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right">
                      {c.gstin ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void reverify(c);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-light-green/25"
                          title="Refresh from GST portal"
                        >
                          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-light-green/20 px-3 py-2 text-xs text-mid-green">
          <p>
            {loading ? "Loading…" : `${from}–${to} of ${total}`}
          </p>
          {totalPages > 1 ? (
            <div className="flex gap-1.5">
              {page > 1 ? (
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={loading}
                  className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70 disabled:opacity-40"
                >
                  Previous
                </button>
              ) : null}
              {page < totalPages ? (
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={loading}
                  className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70 disabled:opacity-40"
                >
                  Next
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <MasterDetailDialog
          kind="client"
          title={detail.legalName}
          subtitle={[detail.sourceClientId || detail.code, detail.gstin].filter(Boolean).join(" · ")}
          badge={detail.clientTypeName}
          loading={detailLoading}
          data={hasMasterFields(detail.masterData) ? detail.masterData : clientMasterFallback(detail)}
          onClose={() => setDetail(null)}
          actions={
            detail.gstin ? (
              <button
                type="button"
                onClick={() => reverify(detail)}
                className="inline-flex items-center gap-1 rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm text-mid-green hover:bg-mid-green/10"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                Re-verify GSTIN
              </button>
            ) : null
          }
        >
          <ClientContactsEditor
            partyId={detail.id}
            contacts={detail.contacts || []}
            onChange={(contacts) => {
              setDetail((d) => (d ? { ...d, contacts } : d));
              setClients((list) =>
                list.map((c) => (c.id === detail.id ? { ...c, contacts } : c))
              );
            }}
          />
        </MasterDetailDialog>
      ) : null}

      {modalOpen ? (
        <ClientOnboardDialog
          onClose={() => setModalOpen(false)}
          onSaved={(name) => {
            setModalOpen(false);
            setMessage(`Saved ${name}`);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
