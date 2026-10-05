"use client";

import { format } from "date-fns";
import EmptyDayCard from "@/components/sessions/EmptyDayCard";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import AlertBox from "@/components/calendar/AlertBox";
import { loadRule, ruleTagColors, type LoadContext } from "@/lib/loadRule";
import type { DayAlert } from "@/lib/alerts";
import type { ExerciseAttachments } from "@/types";
/* Seul le score est lu ici — un objet minimal suffit, permet à /coach/planning (qui n'a qu'un
   score déjà résolu par jour, pas une ligne wellness_daily complète) de passer directement sans
   fabriquer un faux WellnessDaily. `zoneLabel` (optionnel) : libellé de zone déjà résolu par
   l'appelant (relatif — "Équilibré" — dès que sa baseline perso a assez d'historique pour ce
   jour, src/lib/wellnessBaseline.ts) ; absent = repli sur le libellé absolu calculé ici même
   (formLabel), comportement inchangé. */
export interface WellnessScoreLike { score: number | null; zoneLabel?: string }

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return score >= 75 ? "#2f9e44" : score >= 55 ? "#f28a00" : "#d10000";
}
function formLabel(score: number | null) {
  if (score === null) return "Non renseigné";
  if (score >= 82) return "Zone optimale";
  if (score >= 65) return "Zone stable";
  if (score >= 45) return "Zone prudente";
  return "Zone récupération";
}

/* Forme minimale commune à `Session` (sportif) et `CoachViewSession` (coach) — permet à DayColumn/
   WeekSessionCard d'être littéralement le même composant sur /week et /coach/planning, chacun avec
   son propre type concret (générique T), sans dupliquer le rendu. */
export interface SessionLike {
  id: string;
  date: string;
  name: string;
  notes: string | null;
  duration: number | null;
  rpe: number | null;
  done: boolean;
  target_difficulty: number | null;
  exercise_media?: Record<string, ExerciseAttachments> | null;
  viewed_by_athlete_at?: string | null;
  viewed_by_coach_at?: string | null;
  /* Calculé côté affichage (jamais en base) : séance d'un programme ThePerfClub au-delà de J+7,
     libellé de dévoilement. */
  concealed?: string | null;
}

/* ─── Week session card (v59 POC exact layout) — extrait de WeekClient.tsx pour être réutilisé
   à l'identique par /coach/planning et par l'aperçu programme de l'onboarding (WeekPreviewStep.tsx). ─── */
export function WeekSessionCard<T extends SessionLike>({ session, onComplete, onEdit, dragHandleProps, cardRef, cardStyle, renderExerciseLine, hideActions, decisionGauge, onStart, liveLabel }: {
  session: T;
  onComplete: (s: T) => void;
  /* Séance en direct (2026-10-02) : Démarrer / Reprendre (séance du jour à faire, côté sportif). */
  onStart?: (s: T) => void;
  /* « En cours · mm:ss » quand la séance tourne (calculé par l'appelant). */
  liveLabel?: string | null;
  onEdit: (s: T) => void;
  onDuplicate?: (s: T) => void;
  /* Optionnelles — branchées par WeekClient.tsx/CoachPlanningClient.tsx pour le drag & drop entre
     jours (dnd-kit). `undefined` par défaut : zéro impact sur l'aperçu onboarding (WeekPreviewStep.tsx),
     qui ne les passe jamais. */
  dragHandleProps?: Record<string, unknown>;
  cardRef?: (el: HTMLDivElement | null) => void;
  cardStyle?: React.CSSProperties;
  /* Réordonnancement des exercices par drag & drop — remplace le rendu par défaut d'une ligne
     d'exercice quand fourni. */
  renderExerciseLine?: (line: string, index: number) => React.ReactNode;
  /* Masque le bloc Terminer/Dupliquer — réservé aux aperçus en lecture seule (ReconduireModal.tsx)
     où onComplete/onEdit/onDuplicate ne sont que des no-ops requis par le type : ce n'est pas
     l'endroit où l'action se fait, les boutons n'ont donc pas leur place à l'écran. */
  hideActions?: boolean;
  /* Remplace la jauge de difficulté statique (#2) par la jauge de décision interactive
     (AutoregButtons, 2026-09 2e itération — "la jauge de décision EST la jauge de la séance, pas 2
     jauges") — fourni UNIQUEMENT par WeekClient.tsx/CoachPlanningClient.tsx pour la séance ciblée
     par une suggestion d'autorégulation du jour, `undefined` partout ailleurs (comportement
     inchangé : DiffGauge statique reste affiché). */
  decisionGauge?: React.ReactNode;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const isFuture = session.date > format(new Date(), "yyyy-MM-dd");
  // Séance d'un programme ThePerfClub au-delà de J+7 (2026-10-05) : exercices floutés, pas d'ouverture.
  const concealed = session.concealed ?? null;
  // Single gauge: rpe if done, target_difficulty if planned
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);

  return (
    <div
      ref={cardRef}
      style={{
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        background: "#fff", borderRadius: 16, padding: "10px 11px",
        cursor: concealed ? "default" : "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.045)",
        transition: "transform .2s ease, box-shadow .2s ease",
        ...cardStyle,
      }}
      onClick={() => { if (!concealed) onEdit(session); }}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
        {dragHandleProps && !concealed && (
          <span
            {...dragHandleProps}
            title="Glisser vers un autre jour"
            style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 12, flexShrink: 0, marginTop: 2, userSelect: "none" as const, lineHeight: 1 }}
          >⠿</span>
        )}
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word", flex: 1 }}>
          {session.name}
        </div>
        <span style={{
          fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
          background: session.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,0.10)",
          color: session.done ? "#2f9e44" : "#d44000",
        }}>
          {session.done ? "Terminé" : liveLabel ? `● ${liveLabel}` : "Prévu"}
        </span>
      </div>

      {/* 2. Single gauge — jauge de décision interactive si une suggestion cible cette séance,
         DiffGauge statique sinon (no label) */}
      {decisionGauge ? (
        <div style={{ marginBottom: 8 }} onClick={e => e.stopPropagation()}>
          {decisionGauge}
        </div>
      ) : gaugeValue && (
        <div style={{ marginBottom: 8 }}>
          <DiffGauge value={gaugeValue} height={10} />
        </div>
      )}

      {/* 3. Exercise display list (v50 — no numbers) */}
      {concealed ? (
        <div style={{ marginBottom: 8 }}>
          {exercises.length > 0 && (
            <div aria-hidden style={{ borderRadius: 12, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
              {exercises.map((ex, i) => (
                <div key={i} style={{ padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4, color: "#2c3236", fontWeight: 600, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>{ex}</div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 7, fontSize: 11, fontWeight: 700, color: "#8a8f94" }}>🔒 {concealed}</div>
        </div>
      ) : exercises.length > 0 && (
        <div style={{ marginBottom: 8, borderRadius: 12, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
          {exercises.map((ex, i) => renderExerciseLine ? (
            <div key={i}>{renderExerciseLine(ex, i)}</div>
          ) : (
            <div key={i} style={{
              padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4,
              color: "#2c3236", fontWeight: 600,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
              background: "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {ex}
            </div>
          ))}
        </div>
      )}

      {/* 4. Résultat ou actions (2026-10-02) : une séance faite montre sa durée et sa difficulté
          réelles (tap = corriger), plus de bouton Résultat. Jour futur : aucune action (on ne
          termine pas une séance qui n'a pas eu lieu). Aujourd'hui : Démarrer + « Déjà faite ? ».
          Jour passé : Terminer. Dupliquer vit désormais dans le tiroir d'édition. */}
      {!hideActions && session.done && (session.duration || session.rpe) ? (
        <div onClick={e => { e.stopPropagation(); onComplete(session); }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, cursor: "pointer" }}>
          {[{ v: session.duration, l: "MIN" }, { v: session.rpe, l: "DIFF." }].map(t => t.v ? (
            <div key={t.l} style={{ background: "#f7f8f9", borderRadius: 8, padding: "5px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#d44000", lineHeight: 1 }}>{t.v}</div>
              <div style={{ fontSize: 8.5, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", color: "#8a8f94", marginTop: 3 }}>{t.l}</div>
            </div>
          ) : <div key={t.l} />)}
        </div>
      ) : !hideActions && !session.done && !isFuture && (
        <div onClick={e => e.stopPropagation()}>
          {onStart ? (
            <button
              onClick={() => onStart(session)}
              style={{ width: "100%", height: 32, borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
            >
              {liveLabel ? "Reprendre la séance" : "▶ Démarrer"}
            </button>
          ) : (
            <button
              data-tour="terminer-btn"
              onClick={() => onComplete(session)}
              style={{ width: "100%", height: 32, borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
            >
              Terminer<span className="tour-lock">🔒</span>
            </button>
          )}
          {onStart && !liveLabel && (
            <div style={{ textAlign: "center", marginTop: 6 }}>
              <button onClick={() => onComplete(session)} style={{ border: "none", background: "none", color: "#8a8f94", fontSize: 10.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                Déjà faite ? Noter le résultat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Day column — extrait de WeekClient.tsx, réutilisé à l'identique par /coach/planning
   (CoachPlanningClient.tsx, générique sur CoachViewSession) et par l'aperçu programme de
   l'onboarding (WeekPreviewStep.tsx, générique sur Session). ─── */
export default function DayColumn<T extends SessionLike>({ date, sessions, wellness, todayStr, ctx, onAddSession, onComplete, onEdit, onDuplicate, onWellness, hideDayNumber, hideAddSession, emptyToday, emptyPerspective, recoveryAdvice, alert, alertActions, renderSession, columnRef, columnStyle, onProgram }: {
  date: Date; sessions: T[]; wellness: WellnessScoreLike | null;
  /* Carte du jour vide : lien vers Programmes (2026-10-02). */
  onProgram?: () => void;
  todayStr: string; ctx?: LoadContext; onAddSession: (d: string) => void;
  onComplete: (s: T) => void; onEdit: (s: T) => void;
  onDuplicate?: (s: T) => void; onWellness: () => void;
  /* Props optionnelles réservées à l'aperçu programme de l'onboarding (WeekPreviewStep.tsx) —
     `false`/`undefined` par défaut, donc zéro impact sur /week et /coach/planning. */
  hideDayNumber?: boolean;
  /* Masque le CTA "+ Ajouter une séance" en pied de colonne — réservé à l'aperçu mobile de
     DecisionStep.tsx (FrisePreviews.tsx, `ProgramPreview3Days`), qui n'a aucun geste réel à offrir. */
  hideAddSession?: boolean;
  /* Jour d'aujourd'hui sans séance (2026-10-01) : activé par /week et /coach/planning, remplace
     "Repos / libre" + "+ Ajouter une séance" par la carte "Aucune séance aujourd'hui" (EmptyDayCard). */
  emptyToday?: boolean;
  emptyPerspective?: "athlete" | "coach";
  recoveryAdvice?: string;
  /* Remplace tout l'encart (prioritaire sur recoveryAdvice) — réservé à la carte "aujourd'hui",
     reprend le style/logique réels de l'alerte wellness de TodayClient.tsx (sportif) ou de
     decisionText() de CoachAthleteCard.tsx (coach). */
  alert?: DayAlert;
  /* Boutons de décision (Maintenir / Alléger|Surcharger →) sous le texte de `alert` — réservés à la
     carte "aujourd'hui" de /week et /coach/planning, jamais fournis par l'aperçu onboarding. Ignoré
     si `alert` est absent (pas de sens sans encart). */
  alertActions?: React.ReactNode;
  /* Optionnelles — branchées par WeekClient.tsx/CoachPlanningClient.tsx pour le drag & drop entre
     jours, `undefined` par défaut ailleurs (onboarding) : zéro changement de comportement. */
  renderSession?: (session: T) => React.ReactNode;
  columnRef?: (el: HTMLDivElement | null) => void;
  columnStyle?: React.CSSProperties;
}) {
  const dstr = format(date, "yyyy-MM-dd");
  const isToday = dstr === todayStr;
  const score = wellness?.score ?? null;
  const rule = loadRule(sessions, ctx);
  const tagColor = ruleTagColors[rule.cls];
  const showEmptyToday = isToday && sessions.length === 0 && !!emptyToday && !hideAddSession;

  return (
    <div ref={columnRef} className="week-col-width" style={{
      position: "relative",
      background: "#fff",
      border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,0.08)",
      borderRadius: 24, padding: 16,
      boxShadow: isToday ? "0 0 0 0 transparent, 0 8px 24px rgba(212,64,0,.08)" : "0 6px 18px rgba(0,0,0,0.05)",
      scrollSnapAlign: "start",
      transition: "transform 0.22s ease, box-shadow 0.22s ease",
      ...columnStyle,
    }}>
      {/* Header: day + ring */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>
            {DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
          </div>
          {!hideDayNumber && (
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 26, fontWeight: 700, color: "#171b1f", lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              {date.getDate()}
            </div>
          )}
          {isToday && (
            <span style={{ fontFamily: "var(--font-mono), monospace", display: "inline-block", fontSize: 9, fontWeight: 700, color: "#fff", background: "#d44000", padding: "2px 7px", borderRadius: 999, marginTop: 3, letterSpacing: "0.04em" }}>
              Aujourd'hui
            </span>
          )}
        </div>
        <div onClick={e => { e.stopPropagation(); onWellness(); }} style={{ cursor: "pointer" }}>
          <PlanningRing score={score} />
        </div>
      </div>

      {/* Zone label */}
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, color: score !== null ? scoreColor(score) : "#8a8f94", marginBottom: 8, letterSpacing: "0.01em" }}>
        {wellness?.zoneLabel ?? formLabel(score)}
      </div>

      {/* Load rule card — remplacé par l'alerte wellness/décision quand un cas notable est détecté
         (prioritaire), sinon par le conseil récupération quand recoveryAdvice est fourni (aperçu
         onboarding uniquement, amalgame /today+/week). Seul CE bloc passe en sombre avec halo +
         pastille pulsants (copie exacte de CoachAthleteCard.tsx, showBadge) — la carte du jour reste
         blanche, comme /week et /coach/planning en vrai. */}
      {alert ? (
        <AlertBox alert={alert} actions={alertActions} />
      ) : recoveryAdvice ? (
        <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#171b1f", marginBottom: 5 }}>🌿 Récupération</div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{recoveryAdvice}</div>
        </div>
      ) : (
        <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
            <div style={{ fontSize: 9, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
              {rule.tag}
            </div>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
        </div>
      )}

      {/* Sessions label */}
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", marginBottom: 7 }}>
        Séances · {sessions.length}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {showEmptyToday && (
          <EmptyDayCard inline perspective={emptyPerspective} onAddFree={() => onAddSession(dstr)} onProgram={onProgram} />
        )}
        {sessions.length === 0 && !showEmptyToday && (
          <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 12, padding: "11px 4px" }}>
            Repos / libre
          </div>
        )}
        {sessions.map(s => renderSession ? renderSession(s) : (
          <WeekSessionCard key={s.id} session={s} onComplete={onComplete} onEdit={onEdit} onDuplicate={onDuplicate} />
        ))}
        {!hideAddSession && !showEmptyToday && (
          <div
            data-tour="add-session-btn"
            onClick={e => { e.stopPropagation(); onAddSession(dstr); }}
            style={{ border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 12, padding: "9px 8px", textAlign: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, transition: "all .15s" }}
          >
            + Ajouter une séance
          </div>
        )}
      </div>
    </div>
  );
}
