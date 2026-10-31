"use client";

/* Paywall v2 (2026-10-30) : feuille à la fermeture du paywall là où il n'y a pas d'offre de sortie
   (offre déjà vue ; dans les apps tant que l'offre de sortie native n'existe pas). Formulée comme une perte, sans prix ni blocage : « Quitter » ferme
   toujours. Rendue dans <body>, comme ExitOffer. */

import { createPortal } from "react-dom";

/* Une fois par jour au plus : le paywall de l'app revient à chaque fonction payante touchée. Mode test (?dbgstep) :
   à chaque fermeture. */
const DAY_KEY = "tpc_loss_sheet_day";
export function lossSheetDue(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("dbgstep")) return true;
    return localStorage.getItem(DAY_KEY) !== new Date().toDateString();
  } catch { return false; }
}
export function markLossSheetSeen() {
  try { localStorage.setItem(DAY_KEY, new Date().toDateString()); } catch { /* stockage bloqué */ }
}

/* Enjeu de l'onboarding (2026-10-31, chantier douleur) : ses propres réponses, pas des chiffres
   d'illustration. Sportif : séances jusqu'à son échéance (deadlineLabel) ou sur 3 mois ; coach : séances par
   semaine de son groupe. Absent (paywall de l'app) : textes génériques. */
export type LossStake = { sessions?: number; deadlineLabel?: string; perWeek?: number };

export default function LossSheet({ mode, onStay, onLeave, stake }: { mode: "athlete" | "coach"; onStay: () => void; onLeave: () => void; stake?: LossStake }) {
  const coach = mode === "coach";
  /* Douleur conséquence, pas symptôme (skill storytelling-tpc, 2026-10-31) : il perd son objectif, pas sa séance de demain. */
  const title = coach
    ? "Tu reviens à l'œil. Et aux blessures qu'on voit trop tard."
    : stake?.deadlineLabel ? "Tu prépares ton échéance au feeling." : "Tu reviens au feeling. Et au même plateau.";
  const keeps = coach
    ? "Tu gardes tes programmes et les points forme de ton groupe. Les décisions, le radar et les bilans s'arrêtent ici."
    : "Tu gardes ton programme et ton point forme. Les décisions du matin et tes bilans s'arrêtent ici.";
  const lead = coach
    ? (stake?.perWeek ? `${stake.perWeek} séances par semaine dans ton groupe, décidées sans savoir qui est cuit. ` : "")
    : stake?.sessions ? `${stake.deadlineLabel ? `D'ici le ${stake.deadlineLabel}` : "Sur 3 mois"}, ${stake.sessions} séances décidées sans savoir si tu pouvais pousser. ` : "";
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onStay(); }} style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#12161b", color: "#fff", borderRadius: "24px 24px 0 0", borderTop: "1px solid rgba(255,255,255,.12)", padding: "10px 20px max(20px, env(safe-area-inset-bottom))", animation: "sheetUp .22s cubic-bezier(0.2,0,0,1)" }}>
        <style>{`@keyframes sheetUp { from { transform: translateY(100%) } to { transform: none } }`}</style>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)", margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.62)", marginTop: 8 }}>
          {lead}{keeps}
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
          <button onClick={onStay} style={{ height: 52, borderRadius: 999, border: 0, background: "#d44000", color: "#fff", fontSize: 15.5, fontWeight: 800, cursor: "pointer" }}>Garder mes 14 jours offerts</button>
          <button onClick={onLeave} style={{ height: 44, border: 0, background: "none", color: "rgba(255,255,255,.45)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Quitter quand même</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
