"use client";

/* Contenu des mini bilans (2026-11-04, concept QCvbPposTtk6okHT9LF5rZ). Les seuils et les phrases restent
   ceux du calcul (checkinResult, physioVerdictAt, heartResultFor, sessionResult, computeAccounts) : ici,
   seulement le choix du grand chiffre, de la visu et de la photo.
   Point forme : 1 ta forme (sans montre : avec la courbe des 7 jours), 2 ressenti vs mesures (avec montre), 3 ta séance du jour.
   Séance : 1 ta semaine, 2 ressenti vs cœur (sinon vs prévu). */

import { sessionQualifier } from "@/lib/metricCards";
import { DIM_PHOTO, LEVER_PHOTO, PHOTO_ACCENT, SPORT_TINT, sportIllustration } from "@/components/bilan/BilanCarousel";
import { sportCover } from "@/lib/programCovers";
import { checkinResult, type CheckinResult, type CheckinRow, type InsightTheme } from "@/lib/checkinInsight";
import { deviceInputsFor, type HealthRow } from "@/lib/deviceWellness";
import { HEART_CALIBRATION, HEART_FAMILY_LABEL, type HeartResult, type PhysioVerdict, type PhysioWorkout } from "@/lib/physioCompare";
import type { ResultSession, SessionResult, WeekSession } from "@/lib/sessionInsight";
import { sessionZone } from "@/lib/sessionInsight";
import type { TodaySession } from "@/lib/resultContext";
import { SCALE_WORDS } from "@/lib/wellnessWords";
import type { DimensionKey } from "@/lib/wellnessBaseline";
import { Chips, Columns, WeekBars, WeekCurve, miniCard, type MiniSlide } from "@/components/physio/MiniBilan";
import { RecupRing, ScoreRing } from "@/components/wellness/PointFormeRing";
import { sessionLoad } from "@/lib/sessionLoad";
import { braiseColor, mixLab } from "@/lib/ringColors";

export const diffWord = (d: number) => (d >= 7.5 ? "Très dure" : d >= 4.5 ? "Dure" : d >= 2.5 ? "Modérée" : "Légère"); // mots de Foster, voir qualitativeDifficulty
const lw = (d: number) => diffWord(d).toLowerCase();
const GREEN = "#9ff0ad", ORANGE = "#ffb08a", BLUE = "#9fcbff", YELLOW = "#ffd27a";
/* Couleurs des onglets (2026-11-04, Gildas : « tes graphiques et les couleurs des onglets ») :
   récupération = teintes de bleu (AGG_BANDS.recup : plus foncé = plus frais), séance = vert / orange / rouge
   de la jauge de difficulté. Le grand chiffre prend la même teinte un cran plus clair (lisible sur fond noir). */
const RECUP_BLUE = (score: number) => (score >= 58 ? "#2368bc" : score >= 42 ? "#6da7ec" : "#bbd6f7");
const RECUP_TEXT = (score: number) => (score >= 58 ? "#6da7ec" : score >= 42 ? "#a8caf4" : "#cde2fb");
/* Difficulté d'une séance : les couleurs et seuils de la jauge des cartes de séance (facile < 5 vert,
   modérée < 8 orange, dure rouge ; AddSessionModal, CLAUDE.md). */
const LOAD_COLOR = (rpe: number) => (rpe >= 8 ? "#d44000" : rpe >= 5 ? "#f28a00" : "#2f9e44");
/* Séance du jour face à sa séance moyenne (sessionQualifier de l'onglet Charge) : légère vert, habituelle
   orange, plus dure rouge. */
const REL_COLOR: Record<string, string> = { "Légère": "#2f9e44", "Modérée": "#f28a00", "Dure": "#d44000" };
const REL_TEXT: Record<string, string> = { "Légère": "#6ede8a", "Modérée": "#ffb35c", "Dure": "#ff8a55" };
const REL_WORD: Record<string, string> = { "Légère": "Légère", "Modérée": "Normale", "Dure": "Plus dure" };
const LOAD_TEXT = (rpe: number) => (rpe >= 8 ? "#ff8a55" : rpe >= 5 ? "#ffb35c" : "#6ede8a");
const DAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];
const dayLetter = (iso: string) => DAY_LETTER[new Date(iso + "T12:00:00").getDay()];
const MINUS = "−";
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? MINUS : ""}${Math.abs(n)}`;
const small: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,0.7)" };

/* Photo du sport du sportif, teintée (même rendu que la slide Charge du bilan). */
function sportPhoto(sport: string | null): { src: string; tint: [string, string] } | null {
  const src = sportIllustration(sport) ?? sportCover(sport);
  return src ? { src, tint: SPORT_TINT.charge! } : null;
}
/* Insight positif → la ressource ; négatif → le problème. */
const POSITIVE_PHOTO: Partial<Record<DimensionKey, string>> = { stress: "meditation", sleep: "reveil", recovery: "recup" };
function themePhoto(t: InsightTheme, sport: string | null): Pick<MiniSlide, "photo" | "sportPhoto"> {
  if (t.kind === "dim") {
    if (!t.positive) return { photo: DIM_PHOTO[t.key] };
    const p = POSITIVE_PHOTO[t.key];
    if (p) return { photo: p };
  } else if (t.kind === "behavior") return { photo: LEVER_PHOTO[t.key] ?? (t.key === "alcohol" ? "soiree" : "ecran") };
  return { photo: "recup", sportPhoto: sportPhoto(sport) };
}

const shiftIso = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* La mesure de la nuit qui s'écarte le plus de sa norme (sommeil, FC au repos, VFC), comparées à
   l'échelle d'un écart notable pour chacune (40 min, 4 bpm, 8 ms). */
type Measure = { key: "sleep" | "rhr" | "hrv"; delta: number; unit: string; label: string; worse: boolean };
export function nightMeasures(date: string, health: HealthRow[]): Measure[] {
  const out: Measure[] = [];
  const today = health.find(h => h.date === date);
  if (today?.sleep_minutes != null && today.sleep_minutes >= 180) {
    const prior = health.filter(h => h.date < date && h.sleep_minutes != null && h.sleep_minutes >= 180).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 28).map(h => Number(h.sleep_minutes));
    if (prior.length >= 5) { const d = Math.round(Number(today.sleep_minutes) - prior.reduce((a, b) => a + b, 0) / prior.length); out.push({ key: "sleep", delta: d, unit: "min", label: "sommeil", worse: d < 0 }); }
  }
  const dv = deviceInputsFor(date, health);
  if (dv.device_resting_hr != null && dv.device_rhr_baseline != null) { const d = Math.round(Number(dv.device_resting_hr) - Number(dv.device_rhr_baseline)); out.push({ key: "rhr", delta: d, unit: "bpm", label: "FC repos", worse: d > 0 }); }
  if (dv.device_hrv_ms != null && dv.device_hrv_baseline != null) { const d = Math.round(Number(dv.device_hrv_ms) - Number(dv.device_hrv_baseline)); out.push({ key: "hrv", delta: d, unit: "ms", label: "VFC", worse: d < 0 }); }
  return out;
}
const SCALE = { sleep: 40, rhr: 4, hrv: 8 } as const;

export type WellnessInput = {
  date: string; checkin: CheckinResult | null; verdict: PhysioVerdict | null; mean: string;
  row: CheckinRow | null; history: CheckinRow[]; todaySession: TodaySession | null; restDay: boolean; health: HealthRow[];
};

export function wellnessSlides(w: WellnessInput, sport: string | null): MiniSlide[] {
  const slides: MiniSlide[] = [];
  const c = w.checkin;
  /* Sans mesure de la nuit (2026-11-04, Gildas : « Ta forme » et « Ta forme sur 7 jours » se répétaient) :
     une seule slide, la courbe des 7 derniers jours remplace la barre Fatigué / Équilibré / Frais.
     (Essai le même jour avec le chart de l'onglet Récupération : « c'était plus clair avant ».) */
  const since = shiftIso(w.date, -6);
  const prior = w.verdict || !w.row || w.row.score == null ? [] : w.history.filter(h => h.date >= since && h.date < w.date && h.score != null).sort((a, b) => a.date.localeCompare(b.date));
  const curve = prior.length >= 3 ? [...prior.map(h => ({ label: dayLetter(h.date), value: Number(h.score) })), { label: dayLetter(w.date), value: Number(w.row!.score) }] : null;
  if (c) {
    const color = RECUP_TEXT(c.score);
    const chips = w.row ? (["sleep", "stress", "recovery", "motivation"] as const).map(k => ({ value: SCALE_WORDS[k].labels[w.row![k]] ?? "", label: k === "sleep" ? "sommeil" : k === "stress" ? "stress" : k === "recovery" ? "corps" : "envie" })) : [];
    /* Plus d'annonce des données à venir (« Encore X points forme… », 06/11, Gildas). */
    const norm: string | null = null;
    slides.push({
      key: "forme", kicker: "" /* « POINT FORME · TA FORME » se répétait (06/11) : le titre suffit */, ...themePhoto(c.theme, sport),
      hero: { big: c.score, unit: "/100", cap: c.relative ? "ta forme ce matin, comparée à ta norme." : "ta forme ce matin, à partir de tes réponses.", color },
      /* Anneau récup à la place du grand chiffre et de la barre Fatigué / Frais (2026-11-06, POC « Le curseur est le
         formulaire ») : le point forme se fait sur cet anneau, le bilan le reprend avec le vrai score. */
      heroNode: <RecupRing score={c.score} norm={c.relative ? 50 : undefined} cap={c.relative ? "ta forme ce matin, comparée à ta norme" : undefined} />,
      /* Constat et conseil du jour en un seul paragraphe (06/11, Gildas : plus clean). */
      sub: c.advice ? `${c.insight} ${c.advice}` : c.insight,
      body: <>
        {curve && <WeekCurve points={curve} color="#6da7ec" dotColor={RECUP_BLUE} />}
        <Chips items={chips} />
        {norm && <div style={{ ...miniCard, gap: 6 }}><div style={small}>{norm}</div></div>}
      </>,
    });
  }

  const v = w.verdict;
  if (v) {
    const ms = nightMeasures(w.date, w.health);
    const top = [...ms].sort((a, b) => Math.abs(b.delta) / SCALE[b.key] - Math.abs(a.delta) / SCALE[a.key])[0];
    const tail = v.kind === "less" ? "alors que tu te sens bien" : v.kind === "more" ? "alors que tu te sens moins bien" : "comme ton ressenti";
    const what = top?.key === "sleep" ? "de sommeil cette nuit" : top?.key === "rhr" ? "de fréquence cardiaque au repos" : "de VFC (variabilité cardiaque)";
    // Récup = bleus (2026-11-04, Gildas) : le niveau MESURÉ sur l'échelle de la récup (pâle = bas, franc = bon).
    const color = RECUP_TEXT(50 + v.zPhysio * 16);
    slides.push({
      key: "physio", kicker: "RESSENTI VS MESURES",
      photo: top?.key === "sleep" || !top ? (top && !top.worse ? "reveil" : "sommeil") : "recup",
      hero: top ? { big: signed(top.delta), unit: top.unit, cap: `${what}, ${tail}.`, color } : { big: v.kind === "agree" ? "=" : "≠", cap: v.title, color },
      sub: w.mean,
      body: <>
        <Columns feel={0.5 + v.zFeel / 5} measure={0.5 + v.zPhysio / 5} band={[0.4, 0.6]} labels={["Ressenti", "Mesuré"]} color="#6da7ec" gapColor="rgba(255,255,255,.75)"
          aria={`Ressenti ${v.zFeel >= 0 ? "au-dessus" : "en dessous"} de ta norme, mesures ${v.zPhysio >= 0 ? "au-dessus" : "en dessous"} de ta norme`} />
        <Chips items={ms.map(m => ({ value: `${signed(m.delta)} ${m.unit}`, label: m.label }))} />
      </>,
    });
  }

  const today = !w.restDay && w.todaySession ? todaySlide(w.todaySession, w.date, sport) : null;
  if (today) slides.push(today);
  return slides;
}

/* « Ta séance du jour » : ce que la reco figée du matin change. `subject` = prénom, côté coach (3e personne,
   seule slide après un point forme saisi par le coach, 2026-11-04). */
export function todaySlide(ts: TodaySession, date: string, sport: string | null, subject?: string): MiniSlide | null {
  const p = ts.autoreg_proposal;
  if (!p || p.date !== date) return null;
  const reco = p.proposed && p.reco != null ? Math.round(p.reco) : 0;
  const mid = p.zoneLow != null && p.zoneHigh != null ? (p.zoneLow + p.zoneHigh) / 2 : null;
  const name = ts.name ? `« ${ts.name} »` : subject ? "sa séance" : "ta séance";
  const [sa, son] = subject ? ["sa", "son"] : ["ta", "ton"];
  return {
    key: "seance", kicker: subject ? "SA SÉANCE DU JOUR" : "TA SÉANCE DU JOUR", photo: "charge", sportPhoto: sportPhoto(sport),
    hero: reco !== 0
      ? { big: signed(reco), unit: "%", cap: `d'intensité sur ${name} : ${sa} séance s'ajuste à ${son} point forme.`, color: reco < 0 ? ORANGE : GREEN }
      : { big: "0", unit: "%", cap: `d'ajustement : ${name} se fait comme prévu, ${son} point forme le permet.`, color: GREEN },
    // Les mots seulement s'ils changent (« Dure → Dure » n'apprend rien) ; sinon une phrase.
    ...(reco !== 0 && mid != null && diffWord(mid) !== diffWord(p.original_difficulty)
      ? { body: <Chips items={[{ value: diffWord(p.original_difficulty), label: "prévue" }, { value: diffWord(mid), label: "ajustée" }]} /> }
      : { sub: reco !== 0 ? `Même séance, ${reco < 0 ? "un cran plus légère" : "un cran plus poussée"} : le détail est dans ${sa} séance.` : `Séance prévue ${lw(p.original_difficulty)}, à faire telle quelle.` }),
  };
}

export type SessionInput = {
  session: ResultSession | null; summary: SessionResult | null; result: HeartResult | null; mean: string; week: WeekSession[];
  workout: PhysioWorkout | null;
  /* Séances des 4 semaines avant le lundi : la séance moyenne de référence (2026-11-04). */
  before?: WeekSession[];
  extras: React.ReactNode; recal: React.ReactNode;
};

/* Photo du sport teintée par le résultat (2026-11-06, POC) : la couleur Braise de l'effort ressenti face à la
   zone de la séance (jade dans la zone, bleu pétrole en dessous, rouille au-dessus). Doublée par le titre. */
function resultPhoto(sp: { src: string; tint: [string, string] } | null, s: ResultSession) {
  const z = sp && s.rpe != null ? sessionZone(s) : null;
  if (!sp || !z) return sp;
  const c = braiseColor(s.rpe, z.low, z.high);
  return { src: sp.src, tint: [mixLab("#05070a", c, 0.22), mixLab(c, "#ffffff", 0.4)] as [string, string] };
}

/* `subject` = prénom du sportif : écran côté coach, 3e personne (2026-11-04). */
export function sessionSlides(x: SessionInput, sport: string | null, subject?: string): MiniSlide[] {
  const T = (tu: string, il: string) => (subject ? il : tu);
  const slides: MiniSlide[] = [];
  const s = x.session;
  const sp = sportPhoto(sport);
  if (s) {
    const load = (w: { rpe: number | null; duration: number | null }) => (w.rpe ?? 0) * (w.duration ?? 0);
    const others = x.week.filter(w => w.id !== s.id && w.done && w.rpe != null);
    const total = load(s) + others.reduce((a, w) => a + load(w), 0);
    const share = s.duration && others.length && total > 0 ? Math.round((load(s) / total) * 100) : null;
    /* Semaine du lundi au dimanche contenant la séance. Chaque jour comparé à SA séance moyenne des 4
       semaines d'avant, comme l'onglet Charge (2026-11-04, Gildas : en seuils absolus, « que des modérées »). */
    const before = (x.before ?? []).filter(w => w.done && w.rpe != null).map(load).filter(v => v > 0);
    const ref = before.length >= 3 ? before.reduce((a, b) => a + b, 0) / before.length : null;
    const dow = (new Date(s.date + "T12:00:00").getDay() + 6) % 7;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = shiftIso(s.date, i - dow);
      const day = d === s.date ? [s, ...others.filter(w => w.date === d)] : others.filter(w => w.date === d);
      const l = day.reduce((a, w) => a + load(w), 0), q = sessionQualifier(l, ref).label;
      return { label: "LMMJVSD"[i], load: l, today: d === s.date, color: REL_COLOR[q] ?? "rgba(255,255,255,0.35)", word: REL_WORD[q] };
    });
    slides.push({
      key: "semaine", kicker: T("TA SEMAINE", "SA SEMAINE"), photo: "charge", sportPhoto: resultPhoto(sp, s),
      hero: share != null
        ? { big: share, unit: "%", cap: T("de ta charge de la semaine en une séance.", "de sa charge de la semaine en une séance."), color: REL_TEXT[sessionQualifier(load(s), ref).label] ?? LOAD_TEXT(s.rpe) }
        : s.duration ? { big: s.duration, unit: "min", cap: `de séance, ressentie ${lw(s.rpe)}.`, color: LOAD_TEXT(s.rpe) }
        : { big: diffWord(s.rpe), cap: T("c'est ainsi que tu as ressenti ta séance.", `c'est ainsi que ${subject} a ressenti sa séance.`), color: LOAD_TEXT(s.rpe) },
      /* Anneau charge à la place du « 30 % » (2026-11-06) : la fin de séance se fait sur cet anneau, le bilan le reprend. */
      /* Charge de la séance en mots, même repère que pendant la notation ; la part de la semaine en 2e ligne quand elle existe. */
      heroNode: s.duration ? (() => { const L = sessionLoad(s.rpe, s.duration); return <ScoreRing palette="charge" fill={L.fill} big={L.word} cap="charge de la séance" cap2={share != null ? T(`${share} % de ta semaine`, `${share} % de sa semaine`) : undefined} />; })() : undefined,
      sub: x.summary?.title,
      body: <>
        {share != null && <WeekBars days={days} note={ref ? T("Par rapport à ta séance moyenne des 4 dernières semaines.", "Par rapport à sa séance moyenne des 4 dernières semaines.") : undefined} />}
        {x.extras}
      </>,
    });
  }

  const r = x.result;
  if (r && r.kind === "calibrating") {
    const left = HEART_CALIBRATION - r.have, fam = HEART_FAMILY_LABEL[r.family];
    slides.push({ key: "coeur", kicker: "RESSENTI VS CŒUR", photo: "charge", sportPhoto: sp,
      hero: { big: left, unit: `séance${left > 1 ? "s" : ""}`, cap: `${fam ? `${fam} ` : ""}encore avec ta fréquence cardiaque, et on pourra comparer ton ressenti à ce qu'elle mesure.`, color: BLUE } });
  } else if (r && r.kind === "ok") {
    const zone = s ? sessionZone(s) : null;
    const hr = x.workout?.avg_hr != null ? Math.round(Number(x.workout.avg_hr)) : null;
    const tail = r.verdict === "agree" ? "pile ce que tu as ressenti" : `alors que ta séance t'a paru ${lw(r.rpe)}`;
    slides.push({ key: "coeur", kicker: "RESSENTI VS CŒUR", photo: "charge", sportPhoto: sp,
      hero: hr != null
        ? { big: hr, unit: "bpm", cap: `de fréquence cardiaque moyenne, ${tail}.`, color: r.verdict === "harder" ? ORANGE : r.verdict === "easier" ? BLUE : GREEN }
        : { big: diffWord(r.predicted), cap: `selon ta fréquence cardiaque, ${tail}.`, color: r.verdict === "harder" ? ORANGE : r.verdict === "easier" ? BLUE : GREEN },
      sub: x.mean,
      body: <>
        <Columns feel={r.rpe / 10} measure={r.predicted / 10} band={zone ? [zone.low / 10, zone.high / 10] : null} bandLabel={zone?.advised ? "CONSEILLÉ" : "PRÉVU"} scale={["LÉGÈRE", "T.DURE"]} labels={["Ressenti", "Fréquence cardiaque"]} color={LOAD_COLOR(r.rpe)}
          aria={`Ressenti ${lw(r.rpe)}, fréquence cardiaque ${lw(r.predicted)}`} />
        <Chips items={[
          ...(s?.duration ? [{ value: `${s.duration} min`, label: "durée" }] : []),
          ...(hr != null ? [{ value: `${hr} bpm`, label: "FC moyenne" }] : []),
          ...(x.workout?.max_hr != null ? [{ value: `${Math.round(Number(x.workout.max_hr))} bpm`, label: "FC max" }] : []),
        ]} />
      </>,
    });
  } else if (s && s.target_difficulty) {
    // Sans fréquence cardiaque : la charge ressentie face à la charge prévue (même durée).
    const pct = Math.round((s.rpe / s.target_difficulty - 1) * 100);
    const off = Math.abs(pct) >= 10;
    slides.push({ key: "prevu", kicker: "RESSENTI VS PRÉVU", photo: "charge", sportPhoto: sp,
      hero: { big: signed(off ? pct : 0), unit: "%", cap: off ? `de charge par rapport au prévu : prévue ${lw(s.target_difficulty)}, ${T("tu l'as", `${subject} l'a`)} ressentie ${lw(s.rpe)}.` : "d'écart avec le prévu : ressentie comme prévue.", color: pct >= 10 ? ORANGE : pct <= -10 ? BLUE : GREEN },
      sub: T("Demain matin, ton point forme dira si tu l'as encaissée.", "Demain matin, son point forme dira si elle est encaissée."),
      body: <>
        <Columns feel={s.rpe / 10} measure={s.target_difficulty / 10} band={null} scale={["LÉGÈRE", "T.DURE"]} labels={["Ressenti", "Prévu"]} color={LOAD_COLOR(s.rpe)} ghost
          aria={`Ressenti ${lw(s.rpe)}, prévu ${lw(s.target_difficulty)}`} />
        <Chips items={[...(s.duration ? [{ value: `${s.duration} min`, label: "durée" }] : []), { value: diffWord(s.rpe), label: "ressenti" }, { value: diffWord(s.target_difficulty), label: "prévu" }]} />
      </>,
    });
  }

  // « ThePerfClub apprend » retiré (2026-11-04, Gildas) : l'annonce de recalage va sur la 1re slide.
  if (x.recal && slides[0]) {
    slides[0] = { ...slides[0], body: <>{slides[0].body}{x.recal}</> };
  }
  return slides;
}

/* Onboarding, étape d'insight (2026-11-04) : ses vraies données en tête du carrousel d'exemples. « Ta
   forme » = le même résultat que son 1er point forme dans l'app (checkinResult, jour 1). Avec Santé
   connecté : sa vraie nuit face à la norme des nuits déjà dans Santé. Pas encore de norme de ressenti :
   le ressenti est son score (bon à partir de 60). Écart → la nuit ouvre le carrousel ; accord → après. */
export function onboardingSlides(o: { date: string; score: number; answers: { sleep: number; stress: number; recovery: number; motivation: number; behaviors?: string[] | null }; health: HealthRow[] | null }, sport: string | null): MiniSlide[] {
  const row = { date: o.date, sleep: o.answers.sleep, stress: o.answers.stress, recovery: o.answers.recovery, motivation: o.answers.motivation, behaviors: o.answers.behaviors ?? [], score: o.score, base_score: o.score, bedtime: "x" } as unknown as CheckinRow;
  const c = checkinResult(row, [], [], null, null, false);
  const forme = wellnessSlides({ date: o.date, checkin: c, verdict: null, mean: "", row: null, history: [], todaySession: null, restDay: true, health: [] }, sport)[0];
  forme.body = <>{forme.body}<Chips items={(["sleep", "stress", "recovery", "motivation"] as const).map(k => ({ value: SCALE_WORDS[k].labels[o.answers[k]] ?? "", label: k === "sleep" ? "sommeil" : k === "stress" ? "stress" : k === "recovery" ? "corps" : "envie" }))} /></>;
  const ms = o.health ? nightMeasures(o.date, o.health) : [];
  const top = [...ms].sort((a, b) => Math.abs(b.delta) / SCALE[b.key] - Math.abs(a.delta) / SCALE[a.key])[0];
  if (!top) return [forme];
  const strong = Math.abs(top.delta) / SCALE[top.key] >= 1;
  const feelGood = c.score >= 60;
  const kind = feelGood && strong && top.worse ? "less" : !feelGood && strong && !top.worse ? "more" : "agree";
  const tail = kind === "less" ? "alors que tu te sens bien" : kind === "more" ? "alors que tu te sens moins bien" : "comme ton ressenti";
  const what = top.key === "sleep" ? "de sommeil cette nuit" : top.key === "rhr" ? "de fréquence cardiaque au repos" : "de VFC (variabilité cardiaque)";
  const m = Math.max(-1, Math.min(1, (top.worse ? -1 : 1) * Math.abs(top.delta) / SCALE[top.key] / 2.5));
  const color = RECUP_TEXT(50 + m * 40);
  const physio: MiniSlide = {
    key: "physio", kicker: "RESSENTI VS MESURES",
    photo: top.key === "sleep" ? (top.worse ? "sommeil" : "reveil") : "recup",
    hero: { big: signed(top.delta), unit: top.unit, cap: `${what}, ${tail}.`, color },
    sub: kind === "less" ? "Vas-y progressivement aujourd'hui : ton ressenti est bon, mais ta nuit dit le contraire."
      : kind === "more" ? "Ton corps a mieux récupéré que tu ne le sens : ta nuit est meilleure que ton ressenti."
      : "Tes deux signaux vont dans le même sens : tu peux te fier à ce que tu ressens.",
    body: <>
      <Columns feel={c.score / 100} measure={0.5 + m / 2} band={[0.4, 0.6]} labels={["Ressenti", "Mesuré"]} color="#6da7ec" gapColor="rgba(255,255,255,.75)" aria={`Ressenti ${feelGood ? "bon" : "bas"}, mesures ${top.worse ? "sous" : "au-dessus de"} ta norme`} />
      <Chips items={ms.map(x => ({ value: `${signed(x.delta)} ${x.unit}`, label: x.label }))} />
    </>,
  };
  return kind === "agree" ? [forme, physio] : [physio, forme];
}
