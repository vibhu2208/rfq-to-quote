"use client";

import { FormEvent, useState } from "react";
import { Building2, Plus, Star, Trash2, X } from "lucide-react";
import { CLIENT_GROUPS } from "@/lib/master-data";
import {
  applyGstinPreview,
  emptyOnboardContact,
  emptyOnboardValues,
  isFlagOn,
  onboardFieldKind,
  onboardFieldLabel,
  onboardFlagHint,
  type OnboardContact,
  type OnboardValues,
} from "@/lib/client-onboard";

const inputClass =
  "w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 text-sm outline-none focus:border-mid-green";

export function ClientOnboardDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [values, setValues] = useState<OnboardValues>(emptyOnboardValues);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  }

  function setContact(index: number, patch: Partial<OnboardContact>) {
    setValues((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function setPrimaryContact(index: number) {
    setValues((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => ({ ...c, isPrimary: i === index })),
    }));
  }

  function addContact() {
    setValues((prev) => ({
      ...prev,
      contacts: [...prev.contacts, emptyOnboardContact(prev.contacts.length === 0)],
    }));
  }

  function removeContact(index: number) {
    setValues((prev) => {
      const next = prev.contacts.filter((_, i) => i !== index);
      const contacts = next.length > 0 ? next : [emptyOnboardContact(true)];
      if (!contacts.some((c) => c.isPrimary)) contacts[0] = { ...contacts[0], isPrimary: true };
      return { ...prev, contacts };
    });
  }

  async function fetchFromPortal() {
    const gstin = (values.fields.GSTIN || "").trim().toUpperCase();
    if (gstin.length !== 15) {
      setMessage("Enter a valid 15-character GSTIN");
      return;
    }
    setFetching(true);
    setMessage("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "gstin", gstin, save: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "Lookup failed");
      }
      const v = data.verification || {};
      const a = data.address || {};
      setValues((prev) =>
        applyGstinPreview(prev, {
          gstin,
          legalName: v.legalName,
          tradeName: v.tradeName,
          status: v.status,
          stateName: v.stateName,
          stateCode: v.stateCode,
          addressLine1: a.addressLine1 || v.address,
          addressLine2: a.addressLine2,
          city: a.city,
          district: a.district,
          state: a.state || v.stateName,
          postalCode: a.postalCode,
        })
      );
      setMessage(v.message || "Details fetched — complete the remaining sections and save");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setFetching(false);
    }
  }

  async function saveClient(e: FormEvent) {
    e.preventDefault();
    const name = (values.fields.ClientName || "").trim();
    if (!name) {
      setMessage("Enter the client name");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const gstin = (values.fields.GSTIN || "").trim();
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "full",
          verifyGstin: gstin.length === 15,
          fields: values.fields,
          contacts: values.contacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Save failed"
        );
      }
      onSaved(data.party?.legalName || name);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const used = new Set<string>();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4 py-6">
      <form
        onSubmit={saveClient}
        autoComplete="off"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-light-green/20 px-6 py-4">
          <div>
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5 text-mid-green" strokeWidth={1.5} />
              Onboard client
            </h2>
            <p className="mt-1 text-xs text-mid-green">
              Same sections as client information. Fetch GSTIN to prefill tax and address, then complete the rest.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-mid-green" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {CLIENT_GROUPS.map((group) => {
            const keys = group.keys.filter((key) => {
              if (used.has(key)) return false;
              used.add(key);
              return true;
            });
            if (keys.length === 0) return null;
            return (
              <section key={group.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mid-green">
                  {group.title}
                </h3>
                {group.title === "Flags" ? (
                  <p className="mb-2 text-xs text-mid-green">
                    Accounting ledger roles. Trading customers usually leave these off unless they are also a vendor.
                  </p>
                ) : null}
                {group.title === "Contact" ? (
                  <OnboardContactsFields
                    contacts={values.contacts}
                    onChange={setContact}
                    onPrimary={setPrimaryContact}
                    onAdd={addContact}
                    onRemove={removeContact}
                  />
                ) : null}
                <div
                  className={
                    group.title === "Flags"
                      ? "grid gap-2 sm:grid-cols-2"
                      : "grid gap-3 sm:grid-cols-2"
                  }
                >
                  {keys.map((key) => {
                    const kind = onboardFieldKind(key);
                    const label = onboardFieldLabel(key);
                    if (kind === "checkbox") {
                      const hint = onboardFlagHint(key);
                      return (
                        <label
                          key={key}
                          className="flex items-start gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={isFlagOn(values.fields[key])}
                            onChange={(e) => setField(key, e.target.checked ? "Yes" : "")}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block font-medium text-dark-primary">{label}</span>
                            {hint ? (
                              <span className="mt-0.5 block text-[11px] leading-snug text-mid-green">
                                {hint}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    }
                    if (kind === "gstin") {
                      return (
                        <div key={key} className="sm:col-span-2">
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                              {label}
                            </span>
                            <div className="flex gap-2">
                              <input
                                value={values.fields[key] || ""}
                                onChange={(e) => setField(key, e.target.value.toUpperCase())}
                                maxLength={15}
                                placeholder="15-character GSTIN"
                                className={`${inputClass} font-mono`}
                              />
                              <button
                                type="button"
                                onClick={() => void fetchFromPortal()}
                                disabled={fetching || (values.fields[key] || "").trim().length !== 15}
                                className="shrink-0 rounded-lg border border-mid-green/40 px-3 py-2 text-sm hover:bg-mid-green/10 disabled:opacity-50"
                              >
                                {fetching ? "Fetching…" : "Fetch"}
                              </button>
                            </div>
                          </label>
                        </div>
                      );
                    }
                    if (kind === "textarea") {
                      return (
                        <label
                          key={key}
                          className={`block text-sm ${key === "ClientAddress" ? "sm:col-span-2" : ""}`}
                        >
                          <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                            {label}
                            {key === "ClientName" ? " *" : ""}
                          </span>
                          <textarea
                            value={values.fields[key] || ""}
                            onChange={(e) => setField(key, e.target.value)}
                            rows={key === "ClientAddress" ? 2 : 3}
                            className={inputClass}
                          />
                        </label>
                      );
                    }
                    return (
                      <label key={key} className="block text-sm">
                        <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                          {label}
                          {key === "ClientName" ? " *" : ""}
                        </span>
                        <input
                          value={values.fields[key] || ""}
                          onChange={(e) => setField(key, e.target.value)}
                          className={inputClass}
                          required={key === "ClientName"}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {message ? (
          <p className="shrink-0 px-6 pb-2 text-sm text-dark-primary">{message}</p>
        ) : null}

        <div className="flex shrink-0 justify-end gap-2 border-t border-light-green/20 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-mid-green hover:bg-light-green/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save client"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OnboardContactsFields({
  contacts,
  onChange,
  onPrimary,
  onAdd,
  onRemove,
}: {
  contacts: OnboardContact[];
  onChange: (index: number, patch: Partial<OnboardContact>) => void;
  onPrimary: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="mb-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-mid-green">People</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mid-green hover:bg-mid-green/10"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Add person
        </button>
      </div>
      {contacts.map((contact, index) => (
        <div
          key={index}
          className="rounded-lg border border-light-green/30 bg-white/40 p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onPrimary(index)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                contact.isPrimary
                  ? "bg-mid-green/15 font-medium text-dark-primary"
                  : "text-mid-green hover:bg-mid-green/10"
              }`}
            >
              <Star
                className="h-3 w-3"
                strokeWidth={1.5}
                fill={contact.isPrimary ? "currentColor" : "none"}
              />
              {contact.isPrimary ? "Primary" : "Set primary"}
            </button>
            {contacts.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="rounded-md p-1 text-mid-green hover:bg-light-green/20"
                aria-label="Remove contact"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                Name
              </span>
              <input
                value={contact.name}
                onChange={(e) => onChange(index, { name: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                Designation
              </span>
              <input
                value={contact.designation}
                onChange={(e) => onChange(index, { designation: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                Email
              </span>
              <input
                type="email"
                value={contact.email}
                onChange={(e) => onChange(index, { email: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-mid-green">
                Phone
              </span>
              <input
                value={contact.phone}
                onChange={(e) => onChange(index, { phone: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
