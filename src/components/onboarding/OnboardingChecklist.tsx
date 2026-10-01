"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  useOnboardingProgress, refreshOnboardingProgress, OPEN_QUICKADD, OPEN_PRIMING,
  type OnboardingStep, type OnboardingStepKey,
} from "@/lib/onboardingProgress";

/* Checklist d'onboarding dans le header (2026-10-01, remplace le wizard post-signup et la bannière
   du haut) : puce de progression à gauche du sélecteur de date + panneau dépliable. Dérivée des
   données (GET /api/onboarding/progress), visible jusqu'à ce que toutes les étapes soient faites.
   S'ouvre toute seule à l'arrivée (une fois par session) et à chaque nouvelle étape cochée. */

const SEEN_KEY = "tpc_onb_seen_count";
const OPENED_KEY = "tpc_onb_opened_session";

export default function OnboardingChecklist() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const sandbox = pathname.startsWith("/sandbox");
  const progress = useOnboardingProgress(!sandbox);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  // Rafraîchi à chaque changement de page (une étape a pu être faite ailleurs).
  useEffect(() => { if (!sandbox) refreshOnboardingProgress(); }, [pathname, sandbox]);

  const doneCount = progress?.steps.filter(s => s.done).length ?? 0;
  const total = progress?.steps.length ?? 0;

  // Ouverture auto : à l'arrivée (1re page de la session) et quand une étape vient d'être cochée.
  useEffect(() => {
    if (!progress || progress.complete || !total) return;
    let seen = -1;
    try { seen = Number(localStorage.getItem(SEEN_KEY) ?? "-1"); } catch { /* stockage indisponible */ }
    let openedThisSession = false;
    try { openedThisSession = sessionStorage.getItem(OPENED_KEY) === "1"; } catch { /* idem */ }
    if (!openedThisSession || doneCount > seen) {
      setOpen(true);
      try { sessionStorage.setItem(OPENED_KEY, "1"); localStorage.setItem(SEEN_KEY, String(doneCount)); } catch { /* idem */ }
      if (doneCount > seen && seen >= 0) posthog.capture("onboarding_checklist_step_completed", { role: progress.role, done: doneCount, total });
    }
  }, [progress, doneCount, total]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = chipRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: Math.max(12, r.left) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  if (!progress || progress.complete || !total) return null;
  const role = progress.role;
  const nextStep = progress.steps.find(s => !s.done);

  function runStep(step: OnboardingStep) {
    posthog.capture("onboarding_checklist_step_clicked", { role, step: step.key, done: step.done });
    setOpen(false);
    const go = (path: string) => router.push(path);
    const key: OnboardingStepKey = step.key;
    if (key === "form") go("/today?checkin=1");
    else if (key === "build") window.dispatchEvent(new Event(OPEN_QUICKADD));
    else if (key === "adjust") go(role === "coach" ? "/coach?today=1" : "/today?today=1");
    else if (key === "invite") go("/coach/athletes?quickadd=invite");
    else if (key === "unlock") window.dispatchEvent(new CustomEvent(OPEN_PRIMING, { detail: { source: "checklist" } }));
  }

  return (
    <>
      <button
        ref={chipRef}
        onClick={() => { setOpen(o => !o); posthog.capture("onboarding_checklist_toggled", { role, open: !open }); }}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 999,
          background: "rgba(255,138,85,.14)", border: "1px solid rgba(255,138,85,.45)", color: "#ffb08a",
          fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="#ff8a55" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(doneCount / total) * 88} 88`} transform="rotate(-90 18 18)" />
        </svg>
        {doneCount}/{total}
      </button>
      {open && pos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483090 }} />
          <div style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 2147483095, width: "min(320px, calc(100vw - 24px))",
            background: "#1a1f24", border: "1px solid rgba(255,255,255,.14)", borderRadius: 18, padding: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,.5)", color: "#fff",
          }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 2 }}>
              {role === "coach" ? "Lance ton équipe" : "Lance ton autorégulation"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 12 }}>
              {doneCount}/{total} étapes · {nextStep ? `Prochaine : ${nextStep.label.toLowerCase()}` : "Tout est prêt"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {progress.steps.map((s, i) => {
                /* Étape "Débloque…" mise en avant en CTA tant qu'elle n'est pas faite (2026-10-01). */
                if (s.key === "unlock" && !s.done) {
                  return (
                    <button
                      key={s.key}
                      onClick={() => runStep(s)}
                      style={{
                        marginTop: 8, width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "#fff",
                        background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.35)",
                      }}
                    >
                      🔓 {s.label}
                    </button>
                  );
                }
                const isNext = s.key === nextStep?.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => runStep(s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%",
                      padding: "9px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                      background: isNext ? "rgba(255,138,85,.12)" : "transparent",
                      border: isNext ? "1px solid rgba(255,138,85,.35)" : "1px solid transparent",
                      color: s.done ? "rgba(255,255,255,.45)" : "#fff",
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700,
                      background: s.done ? "#2f9e44" : "transparent",
                      border: s.done ? "none" : `1.5px solid ${isNext ? "#ff8a55" : "rgba(255,255,255,.3)"}`,
                      color: s.done ? "#fff" : isNext ? "#ff8a55" : "rgba(255,255,255,.6)",
                    }}>
                      {s.done ? "✓" : i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: isNext ? 800 : 600, textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                    {isNext && <span style={{ fontSize: 12, fontWeight: 800, color: "#ff8a55" }}>→</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
