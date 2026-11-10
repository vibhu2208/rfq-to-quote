"use client";

import { useState } from "react";

export default function LeadImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    created?: number;
    duplicates?: { row: number; leadNumbers: string[] }[];
    errors?: { row: number; error: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onImport() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-dark-primary">
            Import / Export
          </h1>
          <p className="text-sm text-mid-green">
            CSV import with duplicate detection, or export the current lead set
          </p>
        </div>
        <a
          href="/api/leads/export"
          className="rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
        >
          Export CSV
        </a>
      </div>

      <section className="rounded-2xl border border-dark-primary/8 bg-white p-5">
        <h2 className="text-sm font-semibold">Import leads (CSV)</h2>
        <p className="mt-1 text-xs text-mid-green">
          Expected columns: Contact / Company / Email / Phone / Requirement /
          Category / Priority / Referral
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            disabled={!file || busy}
            onClick={() => void onImport()}
            className="rounded-full bg-mid-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>

        {result ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              Created: <strong>{result.created ?? 0}</strong>
            </p>
            {result.duplicates?.length ? (
              <div>
                <p className="font-medium text-amber-700">
                  Duplicates skipped ({result.duplicates.length})
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-mid-green">
                  {result.duplicates.slice(0, 20).map((d) => (
                    <li key={d.row}>
                      Row {d.row}: matched {d.leadNumbers.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.errors?.length ? (
              <div>
                <p className="font-medium text-red-700">
                  Errors ({result.errors.length})
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-mid-green">
                  {result.errors.slice(0, 20).map((e) => (
                    <li key={`${e.row}-${e.error}`}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
