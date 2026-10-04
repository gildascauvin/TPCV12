"use client";

import { usePathname } from "next/navigation";
import { openInvite } from "@/components/coach/InviteHost";
import type { CoachAthlete } from "@/types";
import { useDisplayedPeriod } from "@/lib/activityStatus";
import { ActivityStripBar, ActivityStripSkeleton, OPEN_ACTIVITY_DRAWER, useActivityData } from "@/components/layout/ActivityPill";

/* Barre de filtre sportifs — persistante entre les onglets coach (2026-09-24, redesign inspiré du
   POC `poc-coach-context_4.html`, `.athlete-chips`/`.crumb`). Composant purement contrôlé : l'état
   sélectionné (localStorage, clé partagée) est géré par CHAQUE page qui la monte (voir
   `useCoachAthleteFilter()` ci-dessous), pas ici — la persistance "entre les onglets" vient du fait
   que /coach et /coach/planning lisent/écrivent la même clé, pas d'un contexte React partagé (aucune
   des 2 pages n'est montée en même temps, un contexte global n'aurait rien à partager). */

export const COACH_ATHLETE_FILTER_KEY = "coach_athlete_filter";
/** Émis à chaque changement de sélection : la pilule d'activité du header suit le sportif filtré. */
export const COACH_ATHLETE_FILTER_EVENT = "tpc:coach-athlete-filter";

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
    window.dispatchEvent(new Event(COACH_ATHLETE_FILTER_EVENT));
  }
  return { read, write };
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function AthleteFilterBar({ athletes, selectedId, onSelect, contentMaxWidth }: {
  athletes: CoachAthlete[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /* Même largeur de colonne que CalendarHeader/le contenu de la page (2026-09-24) — voir le prop
     identique sur CalendarHeader.tsx pour le pourquoi. */
  contentMaxWidth?: number;
}) {
  const pathname = usePathname() ?? "";
  // Bandeau d'activité fusionné dans cette barre (2026-10-04) : voyant par sportif sur la période
  // affichée en vue Groupe, bandeau du sportif quand il est sélectionné.
  const period = useDisplayedPeriod();
  const { status, loading, basePath } = useActivityData(period, selectedId);
  if (athletes.length === 0) return null;
  const subjectOf = (id: string) => status?.athletes.find(x => x.id === id) ?? null;
  const selected = selectedId ? athletes.find(a => a.id === selectedId) ?? null : null;
  // Inviter toujours visible à droite (2026-10-03) : le geste d'acquisition côté coach, qui n'a plus
  // le "+" de la nav. Ouvre l'invitation sur place (InviteHost), sandbox comprise.
  const sandboxBase = pathname.match(/^\/sandbox\/coach/)?.[0];

  /* Vue Groupe uniquement depuis le 2026-10-04 : un sportif sélectionné remplace la liste par
     "‹ Groupe" + son bandeau d'activité (voir plus haut).
     Historique — toujours la liste complète (2026-09-24, retour explicite de Gildas : "plutôt qu'avoir un bouton
     'équipe' quand on a un sportif sélectionné, je veux que la liste soit toujours visible, c'est
     plus facile de passer de l'un à l'autre") — remplace l'ancien mode "breadcrumb" (qui masquait
     la liste dès qu'un sportif était sélectionné, un "← Équipe" fallait recliquer pour en changer).
     Un seul mode de rendu désormais : la puce active (Équipe ou un sportif) est stylée en dégradé
     orange plein, les autres restent en contour translucide.
     Score de forme retiré des puces (2026-09-26, demande de Gildas) : c'est un sélecteur de
     profil, pas un tableau de bord — le score du sportif sélectionné est de toute façon affiché
     juste en dessous (ring de sa carte). Le prop `scores` (score RELATIF calculé par l'appelant,
     ajouté le 2026-09-25 pour corriger un chiffre faux) disparaît donc avec l'affichage.
     Fond SOMBRE translucide (2026-09-26) : les 3 pages coach sont passées sur DARK_CARD_BG (même
     fond cyan que le sportif, voir CoachPageBg.tsx) — un fond blanc y coupait la page en deux. Le
     translucide laisse le dégradé de la page transparaître sous la barre sticky plutôt que d'en
     empiler un second. Puces recalibrées en conséquence (contour blanc translucide au lieu du
     contour noir, invisible sur fond sombre). */
  if (selected) {
    const subj = subjectOf(selected.id);
    const active = !!subj?.periodActive || loading;
    const backBtn = (
              <button
                onClick={e => { e.stopPropagation(); onSelect(null); }}
                aria-label="Retour au groupe"
                style={{
                  flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", height: 34, padding: "0 13px",
                  borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.88)",
                  border: "1.5px solid rgba(255,255,255,.12)",
                }}
              >
                ‹ Groupe
              </button>
    );
    return (
      <div style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(10,14,18,.72)", backdropFilter: "blur(12px)",
        borderBottom: active ? "1px solid rgba(255,255,255,.08)" : "1px dashed rgba(255,255,255,.22)",
        padding: "6px 16px",
      }}>
        <div style={{ maxWidth: contentMaxWidth, margin: contentMaxWidth ? "0 auto" : undefined }}>
          {loading && !subj ? <ActivityStripSkeleton prefix={backBtn} /> : <ActivityStripBar
            subject={subj}
            period={period}
            athleteId={selected.id}
            who={selected.name}
            basePath={basePath}
            role="coach"
            onOpen={() => window.dispatchEvent(new Event(OPEN_ACTIVITY_DRAWER))}
            prefix={backBtn}
          />}
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{
      position: "sticky", top: 0, zIndex: 40,
      background: "rgba(10,14,18,.72)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,.08)",
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: contentMaxWidth, margin: contentMaxWidth ? "0 auto" : undefined }}>
      <div style={{
        display: "flex", gap: 8, overflowX: "auto", flex: 1, minWidth: 0,
        scrollbarWidth: "none" as const,
      }}>
        <button
          onClick={() => onSelect(null)}
          style={{
            flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
            padding: "8px 15px", borderRadius: 999, fontSize: 13, fontWeight: 700,
            background: selectedId === null ? "linear-gradient(180deg,#f04a08,#d44000)" : "rgba(255,255,255,.07)",
            color: selectedId === null ? "#fff" : "rgba(255,255,255,.88)",
            border: selectedId === null ? "1.5px solid transparent" : "1.5px solid rgba(255,255,255,.12)",
            boxShadow: selectedId === null ? "0 4px 12px rgba(212,64,0,.22)" : "none",
          }}
        >
          👥 Groupe
        </button>
        {athletes.map(a => {
          const active = selectedId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
                padding: "7px 14px 7px 7px", borderRadius: 999, fontSize: 13, fontWeight: active ? 800 : 600,
                border: active ? "1.5px solid transparent" : "1.5px solid rgba(255,255,255,.12)",
                background: active ? "linear-gradient(180deg,#f04a08,#d44000)" : "rgba(255,255,255,.07)",
                color: active ? "#fff" : "rgba(255,255,255,.88)",
                boxShadow: active ? "0 4px 12px rgba(212,64,0,.22)" : "none",
              }}
            >
              <span style={{
                position: "relative", width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,#f04a08,#fb923c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, color: "#fff",
              }}>
                {initials(a.name)}
                {status && (
                  <span aria-hidden="true" style={{
                    position: "absolute", right: -3, bottom: -3, width: 9, height: 9, borderRadius: "50%",
                    background: subjectOf(a.id)?.periodActive ? "#3ddc84" : "#5b6168",
                    border: "2px solid #0d1217",
                    animation: subjectOf(a.id)?.periodActive ? "activityLed 1.8s ease-in-out infinite" : "none",
                  }} />
                )}
              </span>
              {a.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      <button
        onClick={openInvite}
        style={{
          flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
          background: "transparent", color: "#ff8a55", border: "1.5px dashed rgba(255,138,85,.6)",
        }}
      >
        + Inviter
      </button>
      </div>
    </div>
    </>
  );
}
