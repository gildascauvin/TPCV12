"use client";

import { openInvite } from "@/components/coach/InviteHost";
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

/* Le pourquoi de chaque étape (2026-10-01) : une phrase qui vend l'étape, affichée tant qu'elle n'est
   pas faite. Panneau élargi et fond flouté pour leur laisser la place. */
const WHY: Record<"athlete" | "coach", Partial<Record<OnboardingStepKey, string>>> = {
  athlete: {
    form: "30 secondes chaque matin : c'est ce qui cale ta séance sur ton état réel, pas sur un plan figé.",
    build: "Un programme ou une séance libre : sans séance prévue, il n'y a rien à ajuster.",
    adjust: "Ta 1re décision : alléger, maintenir ou pousser selon ta forme du jour. Puis note ton ressenti.",
    unlock: "Garde la décision chaque jour, tes tendances de charge et de récup, et l'analyse de tes tests.",
  },
  coach: {
    invite: "Ils renseignent leur forme en 30 secondes. Tu la vois chaque matin, sans leur écrire.",
    build: "Assigne un programme : chaque séance devient une décision à prendre au bon moment.",
    adjust: "Coach Control te dit qui alléger, qui pousser. Une décision prend un clic.",
    unlock: "Garde Coach Control pour tout ton groupe, avec la charge, la récup et les tests de chacun.",
  },
};
const PANEL_W = 400;

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
    }
  }, [progress, doneCount, total]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = chipRef.current?.getBoundingClientRect();
      const w = Math.min(PANEL_W, window.innerWidth - 24);
      if (r) setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) });
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
    if (key === "account") return;
    if (key === "form") go("/today?checkin=1");
    else if (key === "build") {
      // Ouvre le tiroir "Planifier" de la pilule d'activité (header). Sur une page sans header
      // (/programmes), on va sur l'accueil et la pilule s'ouvre à son montage.
      if ((window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill) window.dispatchEvent(new Event(OPEN_QUICKADD));
      else {
        try { sessionStorage.setItem("tpc_open_activity_pill", "1"); } catch { /* stockage indisponible */ }
        go(role === "coach" ? "/coach" : "/today");
      }
    }
    else if (key === "adjust") go(role === "coach" ? "/coach?today=1" : "/today?today=1");
    else if (key === "invite") openInvite();
    else if (key === "unlock") window.dispatchEvent(new CustomEvent(OPEN_PRIMING, { detail: { source: "checklist" } }));
  }

  return (
    <>
        <button
          ref={chipRef}
          onClick={() => { setOpen(o => !o); posthog.capture("onboarding_checklist_toggled", { role, open: !open }); }}
          aria-expanded={open}
          aria-label={`Démarrage ${doneCount}/${total}`}
          style={{
            position: "relative", width: 40, height: 40, borderRadius: "50%", flexShrink: 0, padding: 0, cursor: "pointer",
            background: "rgba(255,138,85,.14)", border: "1px solid rgba(255,138,85,.45)", color: "#ffb08a",
          }}
        >
          <svg width="38" height="38" viewBox="0 0 36 36" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#ff8a55" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(doneCount / total) * 88} 88`} transform="rotate(-90 18 18)" />
          </svg>
          <span style={{ position: "relative", fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700 }}>{doneCount}/{total}</span>
        </button>
      {open && pos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483090, background: "rgba(4,6,8,.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
          <div style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 2147483095, width: `min(${PANEL_W}px, calc(100vw - 24px))`,
            maxHeight: `calc(100dvh - ${pos.top + 16}px)`, overflowY: "auto",
            background: "#1a1f24", border: "1px solid rgba(255,255,255,.14)", borderRadius: 24, padding: 18,
            boxShadow: "0 20px 50px rgba(0,0,0,.55)", color: "#fff",
          }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 2 }}>
              {role === "coach" ? "Lance ton équipe" : "Lance ton autorégulation"}
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", marginBottom: 14 }}>
              {doneCount}/{total} étapes · {nextStep ? `Prochaine : ${nextStep.label.toLowerCase()}` : "Tout est prêt"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {progress.steps.map((s, i) => {
                /* Étape "Débloque…" mise en avant en CTA tant qu'elle n'est pas faite (2026-10-01). */
                if (s.key === "unlock" && !s.done) {
                  return (
                    <div key={s.key} style={{ marginTop: 8 }}>
                    {WHY[role][s.key] && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.45, textAlign: "center", margin: "0 6px 10px" }}>{WHY[role][s.key]}</div>}
                    <button
                      onClick={() => runStep(s)}
                      style={{
                        width: "100%", padding: "13px 14px", borderRadius: 12, border: "none", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "#fff",
                        background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.35)",
                      }}
                    >
                      🔓 {s.label}
                    </button>
                    </div>
                  );
                }
                const isNext = s.key === nextStep?.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => runStep(s)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", width: "100%",
                      padding: "11px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                      background: isNext ? "rgba(255,138,85,.12)" : "transparent",
                      border: isNext ? "1px solid rgba(255,138,85,.35)" : "1px solid transparent",
                      color: s.done ? "rgba(255,255,255,.45)" : "#fff",
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700,
                      background: s.done ? "#2f9e44" : "transparent",
                      border: s.done ? "none" : `1.5px solid ${isNext ? "#ff8a55" : "rgba(255,255,255,.3)"}`,
                      color: s.done ? "#fff" : isNext ? "#ff8a55" : "rgba(255,255,255,.6)",
                    }}>
                      {s.done ? "✓" : i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: isNext ? 800 : 700, textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                      {!s.done && WHY[role][s.key] && (
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: "rgba(255,255,255,.62)", marginTop: 3 }}>{WHY[role][s.key]}</span>
                      )}
                    </span>
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
