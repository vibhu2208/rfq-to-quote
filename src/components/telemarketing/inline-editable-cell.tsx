"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export function InlineEditableCell({
  value,
  placeholder,
  display,
  emptyActionLabel,
  onSave,
  monospace,
  className = "",
}: {
  value: string;
  placeholder?: string;
  display?: string;
  emptyActionLabel?: string;
  onSave: (next: string) => Promise<void>;
  monospace?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    if (draft.trim() === value.trim()) {
      setEditing(false);
      setError("");
      return;
    }
    try {
      await onSave(draft);
      setEditing(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function startEdit() {
    setEditing(true);
    setError("");
  }

  const shown = display ?? (value.trim() || "");

  if (editing) {
    return (
      <div className={`w-full min-w-[6rem] max-w-[9rem] ${className}`} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
              setError("");
            }
          }}
          onBlur={() => void commit()}
          placeholder={placeholder}
          className={`h-8 w-full rounded-md border border-mid-green/40 bg-white px-2 text-[12px] text-dark-primary outline-none focus:border-mid-green ${monospace ? "font-mono" : ""}`}
        />
        {error ? <p className="mt-0.5 text-[10px] text-rose-600">{error}</p> : null}
      </div>
    );
  }

  if (!shown && emptyActionLabel) {
    return (
      <button
        type="button"
        className="text-[12px] text-mid-green/60 underline decoration-dark-primary/20 hover:text-mid-green"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
      >
        {emptyActionLabel}
      </button>
    );
  }

  return (
    <div
      className={`group flex w-full max-w-[9rem] items-center gap-1 ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
    >
      <span
        className={`min-w-0 flex-1 truncate text-[12px] ${shown ? "text-dark-primary" : "text-mid-green/50"}`}
        title={shown || placeholder || "—"}
      >
        {shown || placeholder || "—"}
      </span>
      <button
        type="button"
        aria-label={`Edit ${placeholder || "field"}`}
        className={`shrink-0 rounded p-0.5 text-mid-green hover:bg-dark-secondary/10 ${hover ? "opacity-100" : "opacity-0"} focus:opacity-100`}
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}