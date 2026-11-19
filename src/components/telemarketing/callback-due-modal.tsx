"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  DateTimePicker,
  parseLocalDateTimeValue,
  toLocalDateTimeValue,
} from "@/components/ui/date-time-picker";

export function CallbackDueModal({
  open,
  contactLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  contactLabel: string;
  onClose: () => void;
  onConfirm: (dueAtIso: string) => void | Promise<void>;
}) {
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return toLocalDateTimeValue(d);
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function submit() {
    const parsed = parseLocalDateTimeValue(due);
    if (!parsed) {
      setError("Choose a valid callback date and time");
      return;
    }
    if (parsed.getTime() < Date.now() - 30_000) {
      setError("Callback must be in the future");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm(parsed.toISOString());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-primary">Schedule callback</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-mid-green" />
          </button>
        </div>
        <p className="text-sm text-mid-green">
          Set a future callback for <span className="font-medium text-dark-primary">{contactLabel}</span>.
        </p>
        <div className="mt-4">
          <DateTimePicker value={due} onChange={setDue} />
        </div>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-mid-green">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save callback"}
          </button>
        </div>
      </div>
    </div>
  );
}
