"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "warn";
type ToastState = { id: number; text: string; kind: ToastKind } | null;

/** Tiny auto-dismissing snackbar. Returns [node, show]. */
export function useToast(durationMs = 2800) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, kind: ToastKind = "info") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), text, kind });
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      <div
        key={toast.id}
        className={`max-w-md rounded-xl border px-3.5 py-2.5 text-[12px] shadow-lg backdrop-blur-md ${
          toast.kind === "success"
            ? "border-emerald-400/40 bg-emerald-950/85 text-emerald-100"
            : toast.kind === "warn"
              ? "border-amber-400/40 bg-amber-950/85 text-amber-100"
              : "border-cyan-400/40 bg-slate-950/90 text-cyan-100"
        }`}
      >
        {toast.text}
      </div>
    </div>
  ) : null;

  return { toast: node, show };
}
