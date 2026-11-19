"use client";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-confirm-title"
        className="w-full max-w-sm rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tm-confirm-title" className="text-lg font-semibold text-dark-primary">
          {title}
        </h2>
        <p className="mt-2 text-sm text-mid-green">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-dark-primary/12 bg-white px-3 py-2 text-sm font-medium text-dark-primary hover:bg-dark-secondary/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${
              tone === "danger"
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-dark-secondary hover:bg-dark-primary"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
