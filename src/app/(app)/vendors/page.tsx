"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Pencil, Plus, RefreshCw, Search, Upload, X } from "lucide-react";
import { PRODUCT_CATEGORIES } from "@/lib/categories";

type VendorCategory = {
  id?: string;
  category: string;
  subcategory: string;
  keywords: string[];
};

type VendorContact = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  isPrimary: boolean;
  vendorCategoryId?: string | null;
  category?: string;
  subcategory?: string;
};

type Vendor = {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsappId: string;
  preferredChannel: "EMAIL" | "WHATSAPP";
  active: boolean;
  categories: VendorCategory[];
  contacts: VendorContact[];
  declinedCount?: number;
};

type VendorForm = Omit<Vendor, "id">;

type VendorListResponse = {
  items: Vendor[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;
const ROW_HEIGHT = 56;

const emptyCategory = (): VendorCategory => ({
  category: PRODUCT_CATEGORIES[0],
  subcategory: "",
  keywords: [],
});

const emptyContact = (): VendorContact => ({
  name: "",
  email: "",
  phone: "",
  role: "",
  isPrimary: false,
  vendorCategoryId: null,
  category: "",
  subcategory: "",
});

const emptyForm = (): VendorForm => ({
  name: "",
  phone: "",
  email: "",
  whatsappId: "",
  preferredChannel: "EMAIL",
  active: true,
  categories: [emptyCategory()],
  contacts: [emptyContact()],
});

function apiError(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const fieldErrors = (value as { fieldErrors?: Record<string, string[]> })
      .fieldErrors;
    if (fieldErrors) return Object.values(fieldErrors).flat().join("; ");
  }
  return "Request failed";
}

function VendorRows({
  vendors,
  onEdit,
  onDeactivate,
}: {
  vendors: Vendor[];
  onEdit: (vendor: Vendor) => void;
  onDeactivate: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 480);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const overscan = 8;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2;
  const endIndex = Math.min(vendors.length, startIndex + visibleCount);
  const padTop = startIndex * ROW_HEIGHT;
  const padBottom = Math.max(0, (vendors.length - endIndex) * ROW_HEIGHT);
  const slice = vendors.slice(startIndex, endIndex);

  return (
    <div
      ref={scrollerRef}
      className="max-h-[min(70vh,720px)] overflow-auto"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#e8f0ee] text-mid-green">
          <tr>
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Channel</th>
            <th className="px-4 py-3 font-medium">Categories</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={6} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {slice.map((vendor, index) => {
            const absoluteIndex = startIndex + index;
            const pocCount = (vendor.contacts || []).filter(
              (contact) => contact.email || contact.phone
            ).length;
            return (
              <tr
                key={vendor.id}
                className={absoluteIndex % 2 === 1 ? "bg-light-green/10" : undefined}
                style={{
                  height: ROW_HEIGHT,
                  contentVisibility: "auto",
                  containIntrinsicSize: `auto ${ROW_HEIGHT}px`,
                }}
              >
                <td className="px-4 py-3 font-medium">{vendor.name}</td>
                <td className="px-4 py-3">
                  <div>{vendor.phone || "—"}</div>
                  <div className="text-xs text-mid-green">{vendor.email}</div>
                  {vendor.whatsappId ? (
                    <div className="mt-0.5 text-[11px] text-mid-green">
                      WA {vendor.whatsappId}
                    </div>
                  ) : null}
                  {pocCount > 0 ? (
                    <div className="mt-1 text-[11px] text-mid-green">
                      {pocCount} POC{pocCount === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-light-green/25 px-2 py-0.5 text-xs">
                    {vendor.preferredChannel === "WHATSAPP" ? "WhatsApp" : "Email"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex max-w-sm flex-wrap gap-1">
                    {vendor.categories.map((category) => {
                      const departmentPoc = (vendor.contacts || []).find(
                        (contact) =>
                          contact.vendorCategoryId &&
                          (contact.vendorCategoryId === category.id ||
                            (contact.category === category.category &&
                              (contact.subcategory || "") ===
                                (category.subcategory || "")))
                      );
                      return (
                        <span
                          key={`${category.category}-${category.subcategory}`}
                          className="rounded bg-mid-green/10 px-2 py-0.5 text-xs text-mid-green"
                          title={
                            departmentPoc
                              ? `POC: ${departmentPoc.name || departmentPoc.email || departmentPoc.phone}`
                              : undefined
                          }
                        >
                          {category.category}
                          {category.subcategory ? ` / ${category.subcategory}` : ""}
                          {departmentPoc?.name ? (
                            <span className="text-dark-secondary/70">
                              {" "}
                              · {departmentPoc.name}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                  <Link
                    href={`/admin/vendors?vendorId=${vendor.id}`}
                    className="mt-1 inline-block text-[11px] text-mid-green underline underline-offset-2 hover:text-dark-secondary"
                  >
                    Departments
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-light-green/25 px-2 py-0.5 text-xs">
                      {vendor.active ? "Active" : "Inactive"}
                    </span>
                    {(vendor.declinedCount ?? 0) > 0 ? (
                      <span
                        className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                        title="Recently declined a price negotiation"
                      >
                        Declined negotiation
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(vendor)}
                      className="rounded p-1.5 text-mid-green hover:bg-light-green/30"
                      title="Edit vendor"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    {vendor.active ? (
                      <button
                        type="button"
                        onClick={() => onDeactivate(vendor.id)}
                        className="rounded p-1.5 text-mid-green hover:bg-light-green/30"
                        title="Deactivate vendor"
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
          {padBottom > 0 ? (
            <tr aria-hidden>
              <td
                colSpan={6}
                style={{ height: padBottom, padding: 0, border: 0 }}
              />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const hasRowsRef = useRef(false);

  useEffect(() => {
    setFiltering(true);
    const timeout = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [q]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!hasRowsRef.current) setLoading(true);
    setFiltering(true);
    const params = new URLSearchParams({
      list: "1",
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (activeFilter !== "all") params.set("active", activeFilter);
    try {
      const response = await fetch(`/api/vendors?${params}`);
      const data = (await response.json()) as VendorListResponse | Vendor[];
      if (requestId !== requestIdRef.current) return;
      if (Array.isArray(data)) {
        hasRowsRef.current = data.length > 0;
        startTransition(() => {
          setVendors(data);
          setTotal(data.length);
        });
      } else {
        const items = Array.isArray(data.items) ? data.items : [];
        hasRowsRef.current = items.length > 0;
        startTransition(() => {
          setVendors(items);
          setTotal(Number(data.total) || 0);
        });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setFiltering(false);
      }
    }
  }, [activeFilter, debouncedQ, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncFromClients() {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/vendors?sync=1&syncOnly=1");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(
          apiError(data.error) || "Could not sync vendors from clients"
        );
        return;
      }
      setMessage(
        `Synced from Is Vendor clients — ${data.created || 0} added, ${data.updated || 0} updated` +
          (data.deactivated ? `, ${data.deactivated} deactivated` : "")
      );
      await load();
    } finally {
      setSyncing(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
    setModalOpen(true);
  }

  async function openEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setMessage("");
    setModalOpen(true);
    setForm({
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      whatsappId: vendor.whatsappId,
      preferredChannel: vendor.preferredChannel,
      active: vendor.active,
      categories:
        vendor.categories.length > 0
          ? vendor.categories.map((category) => ({
              category: category.category,
              subcategory: category.subcategory,
              keywords: category.keywords || [],
            }))
          : [emptyCategory()],
      contacts:
        vendor.contacts?.length > 0
          ? vendor.contacts.map((contact) => ({
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              role: contact.role || "",
              isPrimary: contact.isPrimary,
              vendorCategoryId: contact.vendorCategoryId || null,
              category: contact.category || "",
              subcategory: contact.subcategory || "",
            }))
          : [
              {
                name: vendor.name,
                email: vendor.email,
                phone: vendor.phone,
                role: "",
                isPrimary: true,
                vendorCategoryId: null,
                category: "",
                subcategory: "",
              },
            ],
    });

    try {
      const response = await fetch(`/api/vendors/${vendor.id}`);
      const full = (await response.json()) as Vendor;
      if (!response.ok) return;
      setForm({
        name: full.name,
        phone: full.phone,
        email: full.email,
        whatsappId: full.whatsappId,
        preferredChannel: full.preferredChannel,
        active: full.active,
        categories:
          full.categories?.length > 0
            ? full.categories.map((category) => ({
                category: category.category,
                subcategory: category.subcategory,
                keywords: category.keywords || [],
              }))
            : [emptyCategory()],
        contacts:
          full.contacts?.length > 0
            ? full.contacts.map((contact) => ({
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                role: contact.role,
                isPrimary: contact.isPrimary,
                vendorCategoryId: contact.vendorCategoryId || null,
                category: contact.category || "",
                subcategory: contact.subcategory || "",
              }))
            : [emptyContact()],
      });
    } catch {
      // Keep list-row form if detail fetch fails.
    }
  }

  function updateCategory(index: number, patch: Partial<VendorCategory>) {
    setForm((current) => ({
      ...current,
      categories: current.categories.map((category, categoryIndex) =>
        categoryIndex === index ? { ...category, ...patch } : category
      ),
    }));
  }

  function updateContact(index: number, patch: Partial<VendorContact>) {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact
      ),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const contacts = form.contacts
      .map((contact) => ({
        ...contact,
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        role: (contact.role || "").trim(),
        vendorCategoryId: contact.vendorCategoryId || null,
        category: (contact.category || "").trim(),
        subcategory: (contact.subcategory || "").trim(),
      }))
      .filter((contact) => contact.name || contact.email || contact.phone);
    const primaryIndex = contacts.findIndex((contact) => contact.isPrimary);
    const normalizedContacts =
      contacts.length === 0
        ? []
        : contacts.map((contact, index) => ({
            ...contact,
            isPrimary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
          }));
    const payload = {
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      whatsappId: form.whatsappId.trim(),
      contacts: normalizedContacts,
    };
    const response = await fetch(
      editingId ? `/api/vendors/${editingId}` : "/api/vendors",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(apiError(data.error));
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this vendor?")) return;
    await fetch(`/api/vendors/${id}`, { method: "DELETE" });
    await load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pending = loading || filtering;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="mt-1 text-sm text-mid-green">
            Clients marked Is Vendor, plus categories and matching keywords.{" "}
            <Link
              href="/admin/vendors"
              className="underline underline-offset-2 hover:text-dark-secondary"
            >
              Manage category mapping in Admin
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/vendors"
            className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            Admin mapping
          </Link>
          <button
            type="button"
            onClick={() => void syncFromClients()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 text-mid-green ${syncing ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {syncing ? "Syncing…" : "Sync from clients"}
          </button>
          <Link
            href="/vendors/import"
            className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            <Upload className="h-4 w-4 text-mid-green" strokeWidth={1.5} />
            Import CSV/XLSX
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add vendor
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search vendor, POC, phone, email, category…"
            aria-busy={pending}
            className="w-full rounded-lg border border-light-green/40 bg-white/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(event) => {
            setFiltering(true);
            setPage(1);
            setActiveFilter(event.target.value);
          }}
          className="rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm"
        >
          <option value="all">All vendors</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        {pending ? (
          <span className="text-sm text-mid-green" role="status">
            {q !== debouncedQ || filtering ? "Filtering…" : "Loading…"}
          </span>
        ) : (
          <span className="text-sm text-mid-green">
            {total === 0 ? "No vendors" : `${from}–${to} of ${total}`}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        {loading && vendors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-mid-green">
            Loading…
          </div>
        ) : vendors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-mid-green">
            No vendors found
          </div>
        ) : (
          <div className={pending ? "relative opacity-60" : undefined}>
            {pending ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-white/70 px-4 py-2 text-center text-xs text-mid-green">
                Updating results…
              </div>
            ) : null}
            <VendorRows
              vendors={vendors}
              onEdit={(vendor) => void openEdit(vendor)}
              onDeactivate={(id) => void deactivate(id)}
            />
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-mid-green">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || pending}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || pending}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <form
            onSubmit={save}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit vendor" : "Add vendor"}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-mid-green">Name *</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+919876543210"
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">Preferred channel</span>
                <select
                  value={form.preferredChannel}
                  onChange={(event) => {
                    const preferredChannel = event.target.value as
                      | "EMAIL"
                      | "WHATSAPP";
                    setForm((current) => ({
                      ...current,
                      preferredChannel,
                      whatsappId:
                        preferredChannel === "WHATSAPP" &&
                        !current.whatsappId.trim() &&
                        current.phone.trim()
                          ? current.phone.trim()
                          : current.whatsappId,
                    }));
                  }}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2"
                >
                  <option value="EMAIL">Email</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
                <span className="mt-1 block text-[11px] text-mid-green/80">
                  Recore defaults to this channel when requesting products.
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">WhatsApp number</span>
                <input
                  value={form.whatsappId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      whatsappId: event.target.value,
                    }))
                  }
                  placeholder="+919876543210"
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
                <span className="mt-1 block text-[11px] text-mid-green/80">
                  E.164 with country code. Used for product Recore via WhatsApp.
                </span>
              </label>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-mid-green">
                  Points of contact
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      contacts: [...current.contacts, emptyContact()],
                    }))
                  }
                  className="text-xs text-mid-green hover:underline"
                >
                  + Add POC
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {form.contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg bg-white/50 p-3 sm:grid-cols-2"
                  >
                    <input
                      value={contact.name}
                      onChange={(event) =>
                        updateContact(index, { name: event.target.value })
                      }
                      placeholder="Name"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    />
                    <input
                      value={contact.role}
                      onChange={(event) =>
                        updateContact(index, { role: event.target.value })
                      }
                      placeholder="Role, e.g. Sales"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    />
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(event) =>
                        updateContact(index, { email: event.target.value })
                      }
                      placeholder="Email"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    />
                    <input
                      value={contact.phone}
                      onChange={(event) =>
                        updateContact(index, { phone: event.target.value })
                      }
                      placeholder="WhatsApp / phone (+91…)"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs text-mid-green">
                      <input
                        type="checkbox"
                        checked={contact.isPrimary}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contacts: current.contacts.map((row, rowIndex) => ({
                              ...row,
                              isPrimary:
                                rowIndex === index
                                  ? event.target.checked
                                  : false,
                            })),
                          }))
                        }
                      />
                      Primary
                    </label>
                    {contact.category ? (
                      <p className="text-[11px] text-mid-green sm:col-span-2">
                        Department: {contact.category}
                        {contact.subcategory ? ` / ${contact.subcategory}` : ""}{" "}
                        <Link
                          href={
                            editingId
                              ? `/admin/vendors?vendorId=${editingId}`
                              : "/admin/vendors"
                          }
                          className="underline underline-offset-2"
                        >
                          Edit in Admin
                        </Link>
                      </p>
                    ) : null}
                    {form.contacts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            contacts: current.contacts.filter(
                              (_, contactIndex) => contactIndex !== index
                            ),
                          }))
                        }
                        className="justify-self-start text-xs text-mid-green hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-mid-green">Categories</h3>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      categories: [...current.categories, emptyCategory()],
                    }))
                  }
                  className="text-xs text-mid-green hover:underline"
                >
                  + Add category
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {form.categories.map((category, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg bg-white/50 p-3 sm:grid-cols-2"
                  >
                    <select
                      value={
                        (PRODUCT_CATEGORIES as readonly string[]).includes(
                          category.category
                        )
                          ? category.category
                          : "Misc"
                      }
                      onChange={(event) =>
                        updateCategory(index, { category: event.target.value })
                      }
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    >
                      {PRODUCT_CATEGORIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      value={category.subcategory}
                      onChange={(event) =>
                        updateCategory(index, {
                          subcategory: event.target.value,
                        })
                      }
                      placeholder="Subcategory, e.g. gaming"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm"
                    />
                    <input
                      value={category.keywords.join(", ")}
                      onChange={(event) =>
                        updateCategory(index, {
                          keywords: event.target.value
                            .split(",")
                            .map((keyword) => keyword.trim().toLowerCase())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Keywords: led, monitor, display"
                      className="rounded-lg border border-light-green/40 bg-background px-2 py-2 text-sm sm:col-span-2"
                    />
                    {form.categories.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            categories: current.categories.filter(
                              (_, categoryIndex) => categoryIndex !== index
                            ),
                          }))
                        }
                        className="justify-self-start text-xs text-mid-green hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              Active
            </label>

            {message ? (
              <p className="mt-4 text-sm text-dark-primary">{message}</p>
            ) : null}
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
                disabled={saving}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save vendor"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
