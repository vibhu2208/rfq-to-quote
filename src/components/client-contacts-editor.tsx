"use client";

import { FormEvent, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";

export type ClientContact = {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

const emptyDraft = () => ({
  name: "",
  designation: "",
  email: "",
  phone: "",
  isPrimary: false,
});

export function ClientContactsEditor({
  partyId,
  contacts,
  onChange,
}: {
  partyId: string;
  contacts: ClientContact[];
  onChange: (contacts: ClientContact[]) => void;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(contacts.length === 0);

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError("Enter a contact name");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await fetch(`/api/parties/${partyId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not add contact"
        );
      }
      onChange(Array.isArray(data.contacts) ? data.contacts : []);
      setDraft(emptyDraft());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add contact");
    } finally {
      setAdding(false);
    }
  }

  async function makePrimary(contact: ClientContact) {
    if (contact.isPrimary) return;
    setBusyId(contact.id);
    setError("");
    try {
      const res = await fetch(`/api/parties/${partyId}/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update contact");
      onChange(Array.isArray(data.contacts) ? data.contacts : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update contact");
    } finally {
      setBusyId(null);
    }
  }

  async function removeContact(contact: ClientContact) {
    if (!confirm(`Remove ${contact.name} as a point of contact?`)) return;
    setBusyId(contact.id);
    setError("");
    try {
      const res = await fetch(`/api/parties/${partyId}/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove contact");
      const next = Array.isArray(data.contacts) ? data.contacts : [];
      onChange(next);
      if (next.length === 0) setShowForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove contact");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
          Points of contact
        </h3>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mid-green hover:bg-mid-green/10"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add contact
          </button>
        ) : null}
      </div>

      {contacts.length === 0 && !showForm ? (
        <p className="mb-3 text-sm text-mid-green">No points of contact yet.</p>
      ) : null}

      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-3 rounded-lg bg-white/50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{c.name}</p>
                {c.isPrimary ? (
                  <span className="rounded bg-mid-green/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mid-green">
                    Primary
                  </span>
                ) : null}
              </div>
              {c.designation ? (
                <p className="text-xs text-mid-green">{c.designation}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-mid-green">
                {[c.email, c.phone].filter(Boolean).join(" · ") || "No email or phone"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!c.isPrimary ? (
                <button
                  type="button"
                  onClick={() => void makePrimary(c)}
                  disabled={busyId === c.id}
                  className="rounded p-1.5 text-mid-green hover:bg-light-green/30 disabled:opacity-50"
                  title="Make primary"
                >
                  <Star className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void removeContact(c)}
                disabled={busyId === c.id}
                className="rounded p-1.5 text-mid-green hover:bg-light-green/30 disabled:opacity-50"
                title="Remove contact"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={addContact} className="mt-3 space-y-2 rounded-lg border border-light-green/30 bg-white/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-mid-green"
                placeholder="Contact name"
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Designation</span>
              <input
                value={draft.designation}
                onChange={(e) => setDraft((d) => ({ ...d, designation: e.target.value }))}
                className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-mid-green"
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-mid-green"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Phone</span>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-mid-green"
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-mid-green">
            <input
              type="checkbox"
              checked={draft.isPrimary || contacts.length === 0}
              onChange={(e) => setDraft((d) => ({ ...d, isPrimary: e.target.checked }))}
              disabled={contacts.length === 0}
            />
            Primary contact
          </label>
          <div className="flex justify-end gap-2">
            {contacts.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setDraft(emptyDraft());
                  setError("");
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-mid-green hover:bg-light-green/20"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
            >
              {adding ? "Adding…" : "Save contact"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mt-2 text-sm text-dark-primary">{error}</p> : null}
    </section>
  );
}
