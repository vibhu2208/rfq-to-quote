"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<
  ToastTone,
  { wrap: string; icon: typeof CheckCircle2 }
> = {
  success: {
    wrap: "border-mid-green/25 bg-white text-dark-primary",
    icon: CheckCircle2,
  },
  error: {
    wrap: "border-red-200 bg-white text-red-900",
    icon: XCircle,
  },
  info: {
    wrap: "border-dark-primary/10 bg-white text-dark-primary",
    icon: Info,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((current) => [...current.slice(-4), { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[120] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((item) => {
          const style = TONE_STYLES[item.tone];
          const Icon = style.icon;
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-[0_12px_40px_rgba(11,43,38,0.18)] ${style.wrap}`}
              role="status"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  item.tone === "error"
                    ? "text-red-600"
                    : item.tone === "success"
                      ? "text-mid-green"
                      : "text-mid-green"
                }`}
                strokeWidth={1.7}
              />
              <p className="min-w-0 flex-1 text-sm leading-snug">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-0.5 text-mid-green hover:bg-dark-primary/5 hover:text-dark-primary"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
