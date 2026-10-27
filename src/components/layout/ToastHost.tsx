"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type ToastInput } from "@/lib/toast";

/* Toasts d'action (2026-10-27, lib/toast.ts) : un seul à la fois, posé au-dessus de la barre du bas,
   au-dessus des modales aussi (une confirmation peut suivre la fermeture d'une modale). */
export default function ToastHost() {
  const [item, setItem] = useState<(ToastInput & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => { timers.current.forEach(t => window.clearTimeout(t)); timers.current = []; };
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail;
      clear();
      setLeaving(false);
      setItem({ ...detail, id: Date.now() });
      const ms = detail.ms ?? (detail.action ? 5000 : 2600);
      timers.current.push(window.setTimeout(() => setLeaving(true), ms));
      timers.current.push(window.setTimeout(() => setItem(null), ms + 200));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => { window.removeEventListener(TOAST_EVENT, onToast); clear(); };
  }, []);

  if (!item) return null;
  const dismiss = () => { setLeaving(true); timers.current.push(window.setTimeout(() => setItem(null), 200)); };

  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", left: 0, right: 0, zIndex: 2147483200, pointerEvents: "none",
      bottom: "calc(100px + env(safe-area-inset-bottom,0px))", display: "flex", justifyContent: "center", padding: "0 16px",
    }}>
      <div key={item.id} style={{
        pointerEvents: "auto", display: "flex", alignItems: "center", gap: 14, maxWidth: 420,
        padding: "12px 14px 12px 16px", borderRadius: 16,
        background: "rgba(23,27,31,.96)", color: "#fff", border: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 18px 44px rgba(0,0,0,.40)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        fontSize: 14, fontWeight: 600, lineHeight: 1.3,
        animation: leaving ? "tpcFadeOut .2s ease forwards" : "tpcToastIn .26s cubic-bezier(.2,0,0,1)",
      }}>
        {item.tone === "success" && (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="11" fill="#2f9e44" />
            <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 16, strokeDashoffset: 16, animation: "tpcCheckDraw .35s .1s ease forwards" }} />
          </svg>
        )}
        <span style={{ flex: 1 }}>{item.message}</span>
        {item.action && (
          <button onClick={() => { item.action!.onClick(); dismiss(); }} style={{
            background: "none", border: "none", padding: "4px 2px", cursor: "pointer",
            color: "#ff8a55", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap",
          }}>{item.action.label}</button>
        )}
      </div>
    </div>
  );
}
