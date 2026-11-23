"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
import { GripVertical, Sparkles, X } from "lucide-react";
import { AdminCopilot } from "@/components/admin-copilot";
import { useTelemarketingChrome } from "@/components/telemarketing/telemarketing-chrome";

type Pos = { x: number; y: number };

const STORAGE_KEY = "quote-agent-fab-pos";
const DRAG_THRESHOLD = 5;
const FAB_SIZE = { width: 148, height: 44 };

function clampPos(pos: Pos, width: number, height: number): Pos {
  const pad = 12;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(maxX, Math.max(pad, pos.x)),
    y: Math.min(maxY, Math.max(pad, pos.y)),
  };
}

function readStoredPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function QuoteAgentFab() {
  const pathname = usePathname();
  const telemarketingPage = pathname?.startsWith("/telemarketing");
  const { drawerOpen: telemarketingDrawerOpen } = useTelemarketingChrome();
  const hideFab = telemarketingPage && telemarketingDrawerOpen;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const dragMovedRef = useRef(false);

  function fabDimensions() {
    const rect = fabRef.current?.getBoundingClientRect();
    return {
      width: rect?.width ?? FAB_SIZE.width,
      height: rect?.height ?? FAB_SIZE.height,
    };
  }

  useEffect(() => {
    const stored = readStoredPos();
    const { width, height } = fabDimensions();
    if (stored) {
      setPos(clampPos(stored, width, height));
      return;
    }
    const bottomPad = telemarketingPage ? 88 : 24;
    setPos(
      clampPos(
        {
          x: window.innerWidth - width - 24,
          y: window.innerHeight - height - bottomPad,
        },
        width,
        height
      )
    );
  }, [telemarketingPage]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onResize() {
      if (!pos) return;
      const { width, height } = fabDimensions();
      setPos((current) => (current ? clampPos(current, width, height) : current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  function persist(next: Pos) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
  }

  function snapToEdge(next: Pos, width: number, height: number): Pos {
    const pad = 12;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;
    const cx = next.x + width / 2;
    const cy = next.y + height / 2;
    const snapX = cx < midX ? pad : Math.max(pad, window.innerWidth - width - pad);
    const snapY = cy < midY ? pad : Math.max(pad, window.innerHeight - height - pad);
    return clampPos({ x: snapX, y: snapY }, width, height);
  }

  function startDrag(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const { width, height } = fabDimensions();
    const origin = pos ?? { x: 0, y: 0 };
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    const startX = e.clientX;
    const startY = e.clientY;
    dragMovedRef.current = false;
    let dragging = false;

    function move(ev: globalThis.PointerEvent) {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
          Math.abs(ev.clientY - startY) > DRAG_THRESHOLD)
      ) {
        dragging = true;
        dragMovedRef.current = true;
      }
      if (!dragging) return;
      setPos(clampPos({ x: ev.clientX - dx, y: ev.clientY - dy }, width, height));
    }

    function up(ev: globalThis.PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (dragging) {
        const next = snapToEdge({ x: ev.clientX - dx, y: ev.clientY - dy }, width, height);
        setPos(next);
        persist(next);
      }
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (hideFab) return null;

  return (
    <div
      style={
        pos
          ? { left: pos.x, top: pos.y }
          : { right: 20, bottom: telemarketingPage ? 88 : 20 }
      }
      className="pointer-events-none fixed z-50"
    >
      <div className="pointer-events-none relative flex flex-col items-end">
        {open ? (
          <div className="pointer-events-auto absolute bottom-full right-0 mb-3 flex h-[min(38rem,calc(100dvh-6.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-[min(26rem,calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right)))] flex-col overflow-hidden rounded-2xl border border-dark-primary/10 bg-background shadow-[0_20px_60px_rgba(11,43,38,0.28)] sm:w-[min(28rem,calc(100vw-2rem-env(safe-area-inset-left)-env(safe-area-inset-right)))]">
            <div
              onPointerDown={startDrag}
              className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-dark-primary/8 bg-dark-secondary px-3 py-2.5 text-background active:cursor-grabbing"
            >
              <div className="flex min-w-0 items-center gap-2">
                <GripVertical
                  className="h-4 w-4 shrink-0 text-light-green/70"
                  strokeWidth={1.6}
                  aria-hidden
                />
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mid-green">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">Quote Agent</p>
                  <p className="truncate text-[11px] text-light-green/85">
                    Drag to move · Live quotes, GST, and stock
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-lg p-1.5 text-light-green hover:bg-background/10 hover:text-background"
                aria-label="Close Quote Agent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AdminCopilot compact panel />
            </div>
          </div>
        ) : null}

        <button
          ref={fabRef}
          type="button"
          onPointerDown={startDrag}
          onClick={() => {
            if (dragMovedRef.current) return;
            setOpen((v) => !v);
          }}
          className={`pointer-events-auto inline-flex cursor-grab items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-semibold shadow-[0_12px_32px_rgba(11,43,38,0.28)] transition active:cursor-grabbing ${
            open
              ? "bg-dark-primary text-background hover:bg-dark-secondary"
              : "bg-mid-green text-background hover:bg-dark-secondary"
          }`}
          aria-expanded={open}
          aria-label={open ? "Close Quote Agent" : "Open Quote Agent"}
          title="Drag to move anywhere on screen"
        >
          {open ? (
            <X className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={1.6} />
          )}
          <span>Quote Agent</span>
        </button>
      </div>
    </div>
  );
}