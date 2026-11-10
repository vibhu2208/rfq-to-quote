"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
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
  role: string;
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
    const fieldErrors = (value as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fieldErrors) return Object.values(fieldErrors).flat().join("; ");
  }
  return "Request failed";
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeFilter !== "all") params.set("active", activeFilter);
    const response = await fetch(`/api/vendors?${params}`);
    const data = await response.json();
    setVendors(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, activeFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 300);
    return () => clearTimeout(timeout);
  }, [load]);

  async function syncFromClients() {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/vendors?sync=1&syncOnly=1");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(apiError(data.error) || "Could not sync vendors from clients");
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

  function openEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      whatsappId: vendor.whatsappId,
      preferredChannel: vendor.preferredChannel,
      active: vendor.active,
      categories: vendor.categories.map((category) => ({
        category: category.category,
        subcategory: category.subcategory,
        keywords: category.keywords,
      })),
      contacts:
        vendor.contacts?.length > 0
          ? vendor.contacts.map((contact) => ({
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              role: contact.role,
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
    setMessage("");
    setModalOpen(true);
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
        role: contact.role.trim(),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="mt-1 text-sm text-mid-green">
            Clients marked Is Vendor, plus categories and matching keywords.{" "}
            <Link href="/admin/vendors" className="underline underline-offset-2 hover:text-dark-secondary">
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

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search vendor, POC, phone, email, category…"
            className="w-full rounded-lg border border-light-green/40 bg-white/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(event) => setActiveFilter(event.target.value)}
          className="rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm"
        >
          <option value="all">All vendors</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
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
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No vendors found
                </td>
              </tr>
            ) : (
              vendors.map((vendor, index) => (
                <tr
                  key={vendor.id}
                  className={index % 2 === 1 ? "bg-light-green/10" : undefined}
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
                    {(vendor.contacts || []).filter(
                      (contact) => contact.email || contact.phone
                    ).length > 0 ? (
                      <div className="mt-1 text-[11px] text-mid-green">
                        {
                          (vendor.contacts || []).filter(
                            (contact) => contact.email || contact.phone
                          ).length
                        }{" "}
                        POC
                        {(vendor.contacts || []).filter(
                          (contact) => contact.email || contact.phone
                        ).length === 1
                          ? ""
                          : "s"}
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
                        onClick={() => openEdit(vendor)}
                        className="rounded p-1.5 text-mid-green hover:bg-light-green/30"
                        title="Edit vendor"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                      {vendor.active ? (
                        <button
                          type="button"
                          onClick={() => deactivate(vendor.id)}
                          className="rounded p-1.5 text-mid-green hover:bg-light-green/30"
                          title="Deactivate vendor"
                        >
                          <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      ) : null}
                    </div>
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
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
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
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-mid-green">Preferred channel</span>
                <select
                  value={form.preferredChannel}
                  onChange={(event) => {
                    const preferredChannel = event.target
                      .value as "EMAIL" | "WHATSAPP";
                    setForm((current) => ({
                      ...current,
                      preferredChannel,
                      // Prefill WhatsApp from phone when switching channel.
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
                <h3 className="text-sm font-medium text-mid-green">Points of contact</h3>
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
                              isPrimary: rowIndex === index ? event.target.checked : false,
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
                        updateCategory(index, { subcategory: event.target.value })
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
                  setForm((current) => ({ ...current, active: event.target.checked }))
                }
              />
              Active
            </label>

            {message ? <p className="mt-4 text-sm text-dark-primary">{message}</p> : null}
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
