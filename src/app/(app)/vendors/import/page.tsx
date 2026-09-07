"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";

type PreviewItem = {
  name: string;
  phone: string;
  email: string;
  whatsappId: string;
  preferredChannel: "EMAIL" | "WHATSAPP";
  active: boolean;
  action: "create" | "update";
  existingVendorId: string | null;
  categories: Array<{
    category: string;
    subcategory: string;
    keywords: string[];
  }>;
};

type Preview = {
  items: PreviewItem[];
  errors: Array<{ row: number; message: string }>;
  summary: {
    rows: number;
    groupedVendors: number;
    creates: number;
    updates: number;
  };
};

export default function VendorImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");

  async function previewFile(file: File) {
    setLoading(true);
    setMessage("");
    setPreview(null);
    setFilename(file.name);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/vendors/import/preview", {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(typeof data.error === "string" ? data.error : "Preview failed");
      return;
    }
    setPreview(data);
  }

  async function commit() {
    if (!preview) return;
    setCommitting(true);
    setMessage("");
    const response = await fetch("/api/vendors/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: preview.items }),
    });
    const data = await response.json();
    setCommitting(false);
    if (!response.ok) {
      setMessage(typeof data.error === "string" ? data.error : "Import failed");
      return;
    }
    setMessage(
      `Import complete: ${data.created} created, ${data.updated} updated.`
    );
    setPreview(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vendors" className="text-sm text-mid-green hover:underline">
          ← Vendors
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Import vendors</h1>
        <p className="mt-1 text-sm text-mid-green">
          Preview new vendors and updates before writing anything to the database.
        </p>
      </div>

      <section className="rounded-xl bg-white/50 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <h2 className="text-sm font-medium text-mid-green">Expected columns</h2>
        <p className="mt-2 text-sm">
          name, phone, email, whatsappId, preferredChannel, category,
          subcategory, keywords
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-mid-green">
          <li>Repeat a vendor on multiple rows to assign multiple categories.</li>
          <li>Use comma or pipe-separated keywords.</li>
          <li>WhatsApp vendors require E.164 phone format: +919876543210.</li>
        </ul>
        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary">
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          {loading ? "Reading…" : "Choose CSV/XLSX"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) previewFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {filename ? (
          <span className="ml-3 text-sm text-mid-green">{filename}</span>
        ) : null}
      </section>

      {message ? (
        <p className="rounded-lg bg-light-green/20 px-4 py-3 text-sm">{message}</p>
      ) : null}

      {preview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Source rows", preview.summary.rows],
              ["Grouped vendors", preview.summary.groupedVendors],
              ["New", preview.summary.creates],
              ["Updates", preview.summary.updates],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-white/50 p-4">
                <p className="text-xs text-mid-green">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {preview.errors.length ? (
            <section className="rounded-xl bg-dark-primary/5 p-4">
              <h2 className="text-sm font-medium">Rows requiring correction</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {preview.errors.map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-mid-green">
                Fix these rows in the source file and preview again before import.
              </p>
            </section>
          ) : null}

          <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark-secondary/5 text-mid-green">
                <tr>
                  <th className="px-4 py-3 font-medium">Diff</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Categories / keywords</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item, index) => (
                  <tr
                    key={`${item.name}-${item.phone}-${item.email}`}
                    className={index % 2 === 1 ? "bg-light-green/10" : undefined}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          item.action === "create"
                            ? "bg-mid-green/20 text-mid-green"
                            : "bg-light-green/40 text-dark-primary"
                        }`}
                      >
                        {item.action === "create" ? "NEW" : "UPDATE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">
                      <div>{item.phone || "—"}</div>
                      <div className="text-xs text-mid-green">{item.email}</div>
                    </td>
                    <td className="px-4 py-3">{item.preferredChannel}</td>
                    <td className="px-4 py-3">
                      {item.categories.map((category) => (
                        <div
                          key={`${category.category}-${category.subcategory}`}
                          className="mb-1"
                        >
                          <span className="font-medium">{category.category}</span>
                          {category.subcategory ? ` / ${category.subcategory}` : ""}
                          {category.keywords.length ? (
                            <span className="ml-2 text-xs text-mid-green">
                              {category.keywords.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={commit}
              disabled={
                committing ||
                preview.errors.length > 0 ||
                preview.items.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
              {committing ? "Importing…" : "Commit import"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
