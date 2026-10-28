"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";

export type ClientHit = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  managedByName?: string | null;
  clientTypeName?: string | null;
  sourceClientId?: string | null;
  billingAddress: {
    city: string;
    state: string;
  } | null;
};

type Props = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectClient?: (client: ClientHit | null) => void;
  email?: string;
  phone?: string;
  placeholder?: string;
  required?: boolean;
};

function displayName(c: ClientHit) {
  return c.legalName || c.tradeName || c.code;
}

function isExactClient(c: ClientHit, q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return false;
  return (
    c.legalName.toLowerCase() === n ||
    (c.tradeName || "").toLowerCase() === n
  );
}

export function ClientCompanyField({
  name = "company",
  value,
  onChange,
  onSelectClient,
  email,
  phone,
  placeholder = "Type company name or initials",
  required,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }

    const ac = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q, active: "true", take: "12" });
        const res = await fetch(`/api/parties?${params}`, { signal: ac.signal });
        const data = await res.json();
        if (ac.signal.aborted) return;
        setHits(Array.isArray(data) ? data : []);
        setHighlight(0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHits([]);
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 120);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [value, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim();
  const exact = hits.some((c) => isExactClient(c, q));
  const showAdd = q.length >= 2 && !exact;

  function pick(client: ClientHit) {
    onChange(displayName(client));
    onSelectClient?.(client);
    setOpen(false);
    setAddError("");
  }

  async function addAsClient() {
    if (!q || adding) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          legalName: q,
          email: email || "",
          phone: phone || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.party) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not add client"
        );
      }
      const party = data.party as ClientHit;
      pick(party);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add client");
    } finally {
      setAdding(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" && q) setOpen(true);
      return;
    }
    const options = hits.length + (showAdd ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (options ? (i + 1) % options : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (options ? (i - 1 + options) % options : 0));
    } else if (e.key === "Enter") {
      if (hits[highlight]) {
        e.preventDefault();
        pick(hits[highlight]);
      } else if (showAdd && highlight === hits.length) {
        e.preventDefault();
        void addAsClient();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        name={name}
        value={value}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          onSelectClient?.(null);
          setOpen(true);
          setAddError("");
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
        placeholder={placeholder}
      />
      {open && q.length >= 1 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-light-green/40 bg-background py-1 shadow-lg"
        >
          {searching && hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-mid-green">Searching clients…</p>
          ) : null}
          {hits.map((c, i) => {
            const city = [c.billingAddress?.city, c.billingAddress?.state]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={highlight === i}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(c)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  highlight === i ? "bg-light-green/25" : "hover:bg-light-green/15"
                }`}
              >
                <span className="font-medium text-dark-primary">{displayName(c)}</span>
                {c.tradeName && c.tradeName !== c.legalName ? (
                  <span className="ml-1.5 text-xs text-mid-green">{c.tradeName}</span>
                ) : null}
                <span className="mt-0.5 block text-xs text-mid-green">
                  {[c.sourceClientId || c.code, c.clientTypeName, city, c.gstin]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            );
          })}
          {!searching && hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-mid-green">No matching client in the database</p>
          ) : null}
          {showAdd ? (
            <button
              type="button"
              role="option"
              aria-selected={highlight === hits.length}
              onMouseEnter={() => setHighlight(hits.length)}
              onClick={() => void addAsClient()}
              disabled={adding}
              className={`flex w-full items-center gap-2 border-t border-light-green/30 px-3 py-2 text-left text-sm font-medium text-mid-green ${
                highlight === hits.length ? "bg-light-green/25" : "hover:bg-light-green/15"
              } disabled:opacity-60`}
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {adding ? "Adding client…" : `Add “${q}” as client`}
            </button>
          ) : null}
          {addError ? <p className="px-3 py-1.5 text-xs text-dark-primary">{addError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
