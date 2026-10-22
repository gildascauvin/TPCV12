import type { WellnessDaily } from "@/types";
import { computeWellnessBaselineAt, DIMENSION_KEYS, DIMENSION_LABELS, Z_SWC, Z_MODERATE, type DimensionKey, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { computeBehaviorCorrelations, CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import { buildDailyTimeSeries } from "@/lib/fatigueSignature";
import { recupAggregatePos, bandFor, AGG_BANDS } from "@/lib/metricCards";
import type { Session } from "@/types";
import { BEHAVIOR_META } from "@/lib/behaviors";

/* Résultat du check-in (2026-10-22, POC « Notes en un tap », section « Le check-in ») : le score du
   jour, sa zone, le numéro du matin tant que la norme se construit (1 à 5) et UN insight, le plus
   fort du jour, toujours en mots et en phrases naturelles (jamais « sommeil à 4 » ni un libellé
   d'échelle entre guillemets). Ordre :
   jour 1 > série sous la norme > comportement d'hier > séance très dure d'hier > écart avec hier >
   séance très dure demain > dimension la plus loin de la norme > point bas (sans norme).
   Chaque règle ne parle que si sa donnée existe ; sinon on passe à la suivante. */

export type CheckinRow = Pick<WellnessDaily, "date" | "sleep" | "stress" | "recovery" | "motivation" | "score" | "base_score" | "behaviors"> & {
  bedtime?: string | null;
  device_sleep_minutes?: number | null; device_resting_hr?: number | null; device_rhr_baseline?: number | null; device_hrv_ms?: number | null; device_hrv_baseline?: number | null;
};
export type DoneSession = { date: string; rpe: number | null; done: boolean };

export interface CheckinResult {
  score: number;
  zone: string;
  /* Score relatif à sa norme (sinon repère général). */
  relative: boolean;
  /* Numéro du matin tant que la norme se construit (1 à 5), null ensuite. */
  day: number | null;
  insight: string;
}

/* La question la plus basse, dite comme on la dirait (jamais un libellé d'échelle entre guillemets). */
function lowPhrase(row: CheckinRow, k: DimensionKey): string {
  const v = oriented(row, k), very = v <= 3;
  if (k === "sleep") return very ? "Tu as très mal dormi" : "Tu as mal dormi";
  if (k === "stress") return very ? "Ton stress est très élevé" : "Ton stress est élevé";
  if (k === "recovery") return very ? "Tu as de fortes courbatures" : "Tu as des courbatures";
  return very ? "Tu n'as presque pas envie de t'entraîner" : "Ton envie de t'entraîner est basse";
}
const POSSESSIVE: Record<DimensionKey, string> = { sleep: "ton sommeil", stress: "ton stress", recovery: "ton état physique", motivation: "ton envie" };
const NORM_DAYS = 5;

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Valeur orientée « plus haut = mieux » (le stress est la seule question inversée).
const oriented = (row: CheckinRow, k: DimensionKey) => (k === "stress" ? 11 - row.stress : row[k]);

/* Même norme que l'onglet Récupération (conseilsData) : tous les check-ins des CONSEILS_HISTORY_DAYS
   derniers jours, la moyenne portant sur les 21 derniers check-ins (pas les 21 derniers jours). */
function baselineFor(row: CheckinRow, history: CheckinRow[]): WellnessBaselineResult {
  const from = shiftDate(row.date, -CONSEILS_HISTORY_DAYS);
  return computeWellnessBaselineAt(history.filter(h => h.date < row.date && h.date >= from), row)!;
}

/* Forme du jour (Fitness − Fatigue, en % de la charge chronique) : exactement le calcul de l'onglet
   Récupération (buildDailyTimeSeries sur la même fenêtre). */
export function formAt(sessions: { date: string; rpe: number | null; duration: number | null; done: boolean }[], date: string): number | null {
  const pts = buildDailyTimeSeries(sessions as unknown as Session[], [], CONSEILS_HISTORY_DAYS, new Date(`${date}T12:00:00`));
  return pts[pts.length - 1]?.form ?? null;
}

/* Le score de récupération, UN SEUL partout (2026-10-22, Gildas) : le même agrégat que l'onglet
   Récupération (70 % ressenti, 30 % Forme), mêmes bandes et mêmes mots (Fatigué / Équilibré / Frais).
   `feel` = score relatif à la norme, ou score absolu tant qu'elle n'existe pas (comme l'onglet). */
export function recoveryAggregate(feel: number | null, form: number | null) {
  const pos = recupAggregatePos({ relativeScore: feel, form });
  return pos == null ? null : { pos, band: bandFor("recup", pos), score: Math.round(pos * 100) };
}

export function checkinResult(today: CheckinRow, history: CheckinRow[], sessions: DoneSession[], tomorrowDifficulty: number | null, form: number | null = null): CheckinResult {
  const prior = history.filter(h => h.date < today.date).sort((a, b) => a.date.localeCompare(b.date));
  const b = baselineFor(today, prior);
  const base = today.base_score ?? today.score ?? 0;
  const relative = b.hasEnoughHistory && b.composite.z != null;
  const z = relative ? b.composite.z! : null;
  const feel = relative ? b.relativeScore : base;
  const agg = recoveryAggregate(feel, form)!;
  const zone = agg.band.label;
  const count = prior.filter(h => h.bedtime != null).length + 1;
  const low = relative ? z! <= -Z_SWC : base < 60;
  const lowest = [...DIMENSION_KEYS].sort((a, c) => oriented(today, a) - oriented(today, c))[0];

  const insight = (() => {
    // 1. Jour 1 : rien à comparer, on vend demain avec le mot qu'il a choisi.
    if (count === 1) return oriented(today, lowest) <= 5
      ? `${lowPhrase(today, lowest)} : dès demain, on saura si c'est ton normal ou un mauvais matin.`
      : "Premier repère posé : dès demain, on saura si ce matin est ton normal.";

    // 2. Le score s'écarte du ressenti à cause de la charge : on le dit, sinon les deux se contredisent.
    if (form != null) {
      const order = AGG_BANDS.recup.map(x => x.label);
      const feelIdx = order.indexOf(bandFor("recup", Math.max(0, Math.min(1, feel / 100))).label), aggIdx = order.indexOf(agg.band.label);
      if (feelIdx > aggIdx) return "Tu te sens bien, mais ta charge récente pèse : ton score reste plus bas que ton ressenti.";
      if (feelIdx < aggIdx) return "Ta charge récente est légère et remonte ton score, mais ton ressenti reste bas.";
    }

    // 3. Série de matins sous la norme (dates consécutives).
    if (relative && low) {
      let streak = 1;
      for (let i = 1; i <= 7; i++) {
        const row = prior.find(h => h.date === shiftDate(today.date, -i));
        if (!row) break;
        const bz = baselineFor(row, prior).composite.z;
        if (bz == null || bz > -Z_SWC) break;
        streak++;
      }
      if (streak >= 3) return `${streak}e matin de suite sous ta norme : la fatigue s'installe. Alléger aujourd'hui, c'est garder la suite.`;
    }

    // 3. Comportement d'hier qui, chez lui, pèse sur la récupération du lendemain.
    if (prior.length >= 12 && (relative ? z! < Z_SWC : base < 80)) {
      const corr = computeBehaviorCorrelations(prior as WellnessDaily[]);
      const hit = (today.behaviors ?? [])
        .filter(k => BEHAVIOR_META[k] && !BEHAVIOR_META[k].positive)
        .map(k => corr.find(c => c.key === k))
        .filter((c): c is NonNullable<typeof c> => !!c && c.impact <= -1)
        .sort((a, c) => a.impact - c.impact)[0];
      if (hit) {
        const dim = hit.dominantDimension;
        return dim && dim.impact < 0
          ? `${hit.label} hier : chez toi, ça pèse surtout sur ${POSSESSIVE[dim.key]}.`
          : `${hit.label} hier : chez toi, la récupération du lendemain en pâtit nettement.`;
      }
    }

    // 4. Séance dure hier et état physique bas ce matin.
    const yesterday = shiftDate(today.date, -1);
    const hardYesterday = sessions.some(s => s.date === yesterday && s.done && (s.rpe ?? 0) >= 8);
    const recZ = b.dimensions.recovery.z;
    if (hardYesterday && (recZ != null ? recZ <= -Z_MODERATE : today.recovery <= 5)) {
      return "État physique en baisse après ta séance très dure d'hier : c'est attendu, ton corps encaisse.";
    }

    // 5. Écart avec hier, sur la question qui a le plus bougé.
    const yRow = prior.find(h => h.date === yesterday);
    if (yRow) {
      const moved = DIMENSION_KEYS.map(k => ({ k, d: oriented(today, k) - oriented(yRow, k) })).sort((a, c) => Math.abs(c.d) - Math.abs(a.d))[0];
      if (Math.abs(moved.d) >= 2) return moved.d > 0 ? `Mieux qu'hier, surtout grâce à ${POSSESSIVE[moved.k]}.` : `Moins bien qu'hier, surtout à cause de ${POSSESSIVE[moved.k]}.`;
    }

    // 6. Séance dure demain et matin bas.
    if ((tomorrowDifficulty ?? 0) >= 8 && low) return "Séance très dure demain : avec ce matin, couche-toi tôt ce soir.";

    // 7. Avec une norme : la question la plus loin de la norme.
    if (relative) {
      // z orienté « plus haut = mieux » (stress inversé) : pour le stress, on parle du stress réel.
      const dom = DIMENSION_KEYS.map(k => ({ k, z: b.dimensions[k].z ?? 0 })).sort((a, c) => Math.abs(c.z) - Math.abs(a.z))[0];
      if (Math.abs(dom.z) >= Z_MODERATE) {
        const bad = dom.z < 0;
        const side = dom.k === "stress" ? (bad ? "au-dessus" : "en dessous") : (bad ? "en dessous" : "au-dessus");
        return `${DIMENSION_LABELS[dom.k]} nettement ${side} de ta norme : c'est ce qui ${bad ? "tire" : "porte"} ton score.`;
      }
      return "Un matin normal pour toi : tes réponses sont dans ta norme.";
    }

    // 8. Sans norme : le point bas du matin, en mots.
    return oriented(today, lowest) <= 5
      ? `${lowPhrase(today, lowest)} : c'est ce qui pèse le plus sur ta récup ce matin.`
      : "Un matin plutôt bon : rien ne te tire vers le bas.";
  })();

  return { score: agg.score, zone, relative, day: count <= NORM_DAYS ? count : null, insight };
}

/* Jauge ouverte du score de récup : la même que l'onglet Récupération (AggregateGauge, mêmes bandes). */
export function recoveryGauge(score: number | null) {
  const bands = AGG_BANDS.recup;
  const pos = score == null ? null : Math.max(0, Math.min(1, score / 100));
  return { pos, band: pos == null ? null : bandFor("recup", pos), bands };
}
