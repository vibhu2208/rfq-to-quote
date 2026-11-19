"use client";

import { useEffect, useRef, useState } from "react";

export function InlineEditableCell({
  value,
  placeholder,
  display,
  emptyActionLabel,
  onSave,
  monospace,
}: {
  value: string;
  placeholder?: string;
  display?: string;
  emptyActionLabel?: string;
  onSave: (next: string) => Promise<void>;
  monospace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
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

  const shown = display ?? (value.trim() || "");

  if (editing) {
    return (
      <div className="min-w-[6rem]" onClick={(e) => e.stopPropagation()}>
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
          className={`h-8 w-full min-w-[7rem] rounded-md border border-mid-green/40 bg-white px-2 text-[12px] text-dark-primary outline-none focus:border-mid-green ${monospace ? "font-mono" : ""}`}
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
          setEditing(true);
        }}
      >
        {emptyActionLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`max-w-[14rem] truncate text-left text-[12px] text-dark-primary hover:underline ${!shown ? "text-mid-green/50" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {shown || placeholder || "—"}
    </button>
  );
}