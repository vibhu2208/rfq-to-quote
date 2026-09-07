"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function PublicRequestPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/public/rfq", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Submission failed");
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-medium text-mid-green">QuoteFlow</p>
        <h1 className="mt-2 text-3xl font-semibold text-dark-primary">Request a quote</h1>
        <p className="mt-2 text-sm text-mid-green">
          Tell us what you need — we&apos;ll get back with pricing.
        </p>

        {done ? (
          <div className="mt-8 rounded-xl bg-white/60 p-6 shadow-[0_8px_30px_rgba(11,43,38,0.08)]">
            <p className="font-medium text-dark-primary">Request received</p>
            <p className="mt-2 text-sm text-mid-green">
              Thanks — your RFQ is in our inbox. We&apos;ll follow up soon.
            </p>
            <button
              type="button"
              onClick={() => setDone(false)}
              className="mt-4 text-sm text-mid-green underline"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-xl bg-white/60 p-6 shadow-[0_8px_30px_rgba(11,43,38,0.08)]"
          >
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Company</span>
              <input
                name="company"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Contact name *</span>
              <input
                name="contactName"
                required
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-dark-secondary">Email</span>
                <input
                  name="email"
                  type="email"
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-dark-secondary">Phone</span>
                <input
                  name="phone"
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Product / service needed *</span>
              <textarea
                name="productNeeded"
                required
                rows={3}
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Quantity</span>
              <input
                name="quantity"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Notes</span>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
            {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-mid-green px-4 py-2.5 font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
            >
              {loading ? "Sending…" : "Submit request"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-mid-green">
          <Link href="/login" className="underline">
            Team login
          </Link>
        </p>
      </div>
    </div>
  );
}
