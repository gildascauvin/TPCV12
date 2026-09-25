"use client";

import { scoreColor } from "@/components/coach/CoachAthleteCard";
import type { CoachAthlete } from "@/types";

/* Barre de filtre sportifs — persistante entre les onglets coach (2026-09-24, redesign inspiré du
   POC `poc-coach-context_4.html`, `.athlete-chips`/`.crumb`). Composant purement contrôlé : l'état
   sélectionné (localStorage, clé partagée) est géré par CHAQUE page qui la monte (voir
   `useCoachAthleteFilter()` ci-dessous), pas ici — la persistance "entre les onglets" vient du fait
   que /coach et /coach/planning lisent/écrivent la même clé, pas d'un contexte React partagé (aucune
   des 2 pages n'est montée en même temps, un contexte global n'aurait rien à partager). */

export const COACH_ATHLETE_FILTER_KEY = "coach_athlete_filter";

export function useCoachAthleteFilterStorage() {
  function read(): string | null {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(COACH_ATHLETE_FILTER_KEY); } catch { return null; }
  }
  function write(id: string | null) {
    try {
      if (id) localStorage.setItem(COACH_ATHLETE_FILTER_KEY, id);
      else localStorage.removeItem(COACH_ATHLETE_FILTER_KEY);
    } catch {}
  }
  return { read, write };
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function AthleteFilterBar({ athletes, selectedId, onSelect, contentMaxWidth, scores }: {
  athletes: CoachAthlete[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /* Même largeur de colonne que CalendarHeader/le contenu de la page (2026-09-24) — voir le prop
     identique sur CalendarHeader.tsx pour le pourquoi. */
  contentMaxWidth?: number;
  /* Score RELATIF par sportif (2026-09-25, retour de Gildas — "les scores... sont faux") : cette
     barre retombait sur `a.wellness_score` (absolu brut) alors que le reste de l'app affiche le
     score relatif (baseline.relativeScore) depuis le chantier "Wellness relatif" (2026-08-30/31) —
     divergeait donc du chiffre affiché sur la carte du même sportif juste en dessous. Calculé par
     l'appelant (qui a déjà `baselines`, la même donnée que CoachCard) — absent = repli sur
     `a.wellness_score` (comportement historique, filet de sécurité uniquement). */
  scores?: Record<string, number | null>;
}) {
  if (athletes.length === 0) return null;

  /* Toujours la liste complète (2026-09-24, retour explicite de Gildas : "plutôt qu'avoir un bouton
     'équipe' quand on a un sportif sélectionné, je veux que la liste soit toujours visible, c'est
     plus facile de passer de l'un à l'autre") — remplace l'ancien mode "breadcrumb" (qui masquait
     la liste dès qu'un sportif était sélectionné, un "← Équipe" fallait recliquer pour en changer).
     Un seul mode de rendu désormais : la puce active (Équipe ou un sportif) est stylée en dégradé
     orange plein, les autres restent en contour clair.
     Fond BLANC (2026-09-24, suite — retour de Gildas) : remplace le fond quasi-noir d'origine,
     pensé avant que cette barre ne devienne la référence "sélecteur commun à tous les onglets" —
     les couleurs de puce ci-dessous sont recalibrées en conséquence (contour clair au lieu de
     translucide-blanc, qui disparaissait sur un fond clair). */
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40,
      background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)",
      padding: "12px 16px",
    }}>
      <div style={{
        display: "flex", gap: 8, overflowX: "auto", maxWidth: contentMaxWidth, margin: contentMaxWidth ? "0 auto" : undefined,
        scrollbarWidth: "none" as const,
      }}>
        <button
          onClick={() => onSelect(null)}
          style={{
            flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
            padding: "8px 15px", borderRadius: 999, fontSize: 13, fontWeight: 700,
            background: selectedId === null ? "linear-gradient(180deg,#f04a08,#d44000)" : "#f7f8f9",
            color: selectedId === null ? "#fff" : "#171b1f",
            border: selectedId === null ? "1.5px solid transparent" : "1.5px solid rgba(0,0,0,.08)",
            boxShadow: selectedId === null ? "0 4px 12px rgba(212,64,0,.22)" : "none",
          }}
        >
          👥 Équipe
        </button>
        {athletes.map(a => {
          const score = scores ? (scores[a.id] ?? null) : (a.wellnessFilledToday === false ? null : a.wellness_score);
          const active = selectedId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
                padding: "7px 14px 7px 7px", borderRadius: 999, fontSize: 13, fontWeight: active ? 800 : 600,
                border: active ? "1.5px solid transparent" : "1.5px solid rgba(0,0,0,.08)",
                background: active ? "linear-gradient(180deg,#f04a08,#d44000)" : "#f7f8f9",
                color: active ? "#fff" : "#171b1f",
                boxShadow: active ? "0 4px 12px rgba(212,64,0,.22)" : "none",
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,#f04a08,#fb923c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, color: "#fff",
              }}>
                {initials(a.name)}
              </span>
              {a.name.split(" ")[0]}
              {score !== null && (
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: active ? "rgba(255,255,255,.20)" : "rgba(0,0,0,.05)", color: active ? "#fff" : scoreColor(score) }}>
                  {score}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
