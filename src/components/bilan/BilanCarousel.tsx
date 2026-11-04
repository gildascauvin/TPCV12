"use client";

/* Carrousel du bilan (2026-10-23, POC canvas Qx548NQG7ZrWgwQA28DYpp) : un écran par thème, façon
   story. Les chiffres viennent de computeBilan() (src/lib/bilan.ts), qui saute tout écran sous son
   seuil de données. Plein écran, au-dessus de la bottom nav (zIndex modale). */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { computeBilan, isSynthetic, periodFor, type Bilan, type BilanCheckin, type BilanPeriodKind, type BilanSession, type BilanSlide, type BilanTest } from "@/lib/bilan";
import type { PersonalDim } from "@/lib/autoregPersonal";
import { loadBilanRaw, type BilanRaw } from "@/lib/bilanData";
import { outcomeRight } from "@/lib/adviceJudge";
import { requestPhysioReplay } from "@/lib/physioData";
import { Dots, Legend, DayCurve, DayFrise } from "@/components/bilan/BilanViz";
import { ImpactBar, impactPill } from "@/components/conseils/ImpactBar";
import { BEHAVIOR_META } from "@/lib/behaviors";
import LockedBlur from "@/components/paywall/LockedBlur";
import { previewSlides } from "@/components/onboarding/InsightSteps";
import { fr1 } from "@/components/physio/PhysioRevealHost";
import { sportCover } from "@/lib/programCovers";
import { computeGroupBilan, type GroupAthlete, type GroupBilan, type GroupSlide, type DayMark } from "@/lib/groupBilan";

type Props = {
  userId: string;
  kind: BilanPeriodKind;
  /* Un jour de la période (n'importe lequel) ; pour « depuis le début », la date de fin. */
  anchor: string;
  today: string;
  source: "home_card" | "date_picker" | "planning" | "coach";
  /* Coach (2026-10-24) : bilan d'un de ses sportifs, lu via /api/coach/bilan (RLS). */
  subject?: { athleteId: string; name: string };
  /* Coach, vue Groupe (2026-10-26) : bilan de tous ses sportifs inscrits (GET /api/coach/group-bilan). */
  group?: boolean;
  /* Freemium (2026-11-03, Gildas : « floute dès le premier ») : le bilan est une sortie. Gratuit sans
     coach payant = Régularité et aperçu nets, les autres écrans entièrement floutés (titre compris, le
     titre est déjà un insight), seul le thème en haut reste lisible ; pas de carte « partage ». */
  locked?: boolean;
  onUnlock?: () => void;
  onClose: () => void;
};
type AnySlide = BilanSlide | GroupSlide;

export const GLOW: Record<AnySlide["kind"], string> = {
  g_decroche: "rgba(212,64,0,0.45)", g_seances: "rgba(242,138,0,0.40)", g_appris: "rgba(168,85,247,0.38)", g_conseils: "rgba(47,158,68,0.38)", g_charge: "rgba(56,189,248,0.36)",
  regularite: "rgba(212,64,0,0.45)", charge: "rgba(47,158,68,0.40)", ressenti: "rgba(56,189,248,0.38)",
  envie: "rgba(242,138,0,0.40)", recup: "rgba(56,189,248,0.36)", rythmes: "rgba(212,64,0,0.40)", prochaine: "rgba(47,158,68,0.38)", apercu: "rgba(212,64,0,0.42)",
  predit: "rgba(212,64,0,0.40)", biais: "rgba(242,138,0,0.40)", fatigue: "rgba(168,85,247,0.38)",
  leviers: "rgba(47,158,68,0.38)", tendance: "rgba(56,189,248,0.36)", tests: "rgba(212,64,0,0.45)", conseils: "rgba(47,158,68,0.38)", suivre: "rgba(168,85,247,0.36)", partage: "rgba(56,189,248,0.20)",
};
export const KICKER: Record<AnySlide["kind"], string> = {
  g_decroche: "QUI DÉCROCHE", g_seances: "TES SÉANCES", g_appris: "APPRIS SUR CHACUN", g_conseils: "CONSEILS VÉRIFIÉS", g_charge: "CHARGE",
  regularite: "RÉGULARITÉ", charge: "CHARGE", ressenti: "RESSENTI VS MONTRE", predit: "CE QUI DURCIT TES SÉANCES",
  biais: "TES BIAIS", fatigue: "CE QUI TE FATIGUE", leviers: "TES LEVIERS", tendance: "TENDANCE", tests: "TESTS", conseils: "L'APP AVAIT-ELLE RAISON ?", suivre: "SUIVRE OU PAS", partage: "EN UNE CARTE",
  envie: "TA TÊTE OU TON CORPS", recup: "TA RÉCUPÉRATION", rythmes: "TES RYTHMES", prochaine: "LA SEMAINE QUI VIENT", apercu: "TON PREMIER BILAN",
};
export const KICKER_COACH: Partial<Record<BilanSlide["kind"], string>> = { predit: "CE QUI DURCIT SES SÉANCES", biais: "SES BIAIS", fatigue: "CE QUI LE FATIGUE", leviers: "SES LEVIERS", envie: "SA TÊTE OU SON CORPS", recup: "SA RÉCUPÉRATION", rythmes: "SES RYTHMES" };
const LEARNED = new Set<BilanSlide["kind"]>(["conseils", "ressenti", "predit", "biais", "fatigue", "suivre", "leviers", "envie", "recup", "rythmes"]);

const card: React.CSSProperties = { background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 10 };
const h2: React.CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.12, fontWeight: 700, color: "#fff" };
const body: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" };
const small: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.65)" };
/* Sous-titre (2026-11-03) : le conseil se lit sous le titre, plus en bas d'écran. */
const sub: React.CSSProperties = { margin: "-8px 0 0", fontSize: 15, lineHeight: 1.45, color: "rgba(255,255,255,0.78)" };
const PREDIT_WORDS: Record<PersonalDim, { subject: string; low: string; high: string }> = {
  stress: { subject: "Le stress", low: "Les jours stressés", high: "Les jours calmes" },
  sleep: { subject: "Une nuit moyenne", low: "Après une nuit correcte ou moins", high: "Après une bonne nuit" },
  recovery: { subject: "Un corps fatigué", low: "Les jours où le corps tire", high: "Les jours corps frais" },
  motivation: { subject: "Le manque d'envie", low: "Les jours sans grande envie", high: "Les jours motivés" },
};
/* Retrouve la dimension d'un bloc depuis son titre (« Force maximale · ton stress mental »). */
const DIM_HINT: Record<PersonalDim, string> = { stress: "stress", sleep: "sommeil", recovery: "état physique", motivation: "motivation" };
const LEVER_WHEN: Record<string, string> = {
  stretching: "Les soirs de stretching", screen_late: "Les soirs d'écran tard", walk: "Les jours de marche", hydration: "Les jours bien hydratés",
  reading: "Les soirs de lecture", meditation: "Les jours de méditation", cold_shower: "Les jours de douche froide", caffeine_late: "Les jours de caféine tard", heavy_meal: "Les soirs de repas lourd", tobacco: "Les jours de tabac", travel: "Les lendemains de voyage", late_sleep: "Les lendemains de coucher tardif",
};
const round = (x: number) => Math.round(x);

/* Piste A + photo (2026-11-03, POC GSXeRzonoyn2UdnD46L9ML v3) : une photo par thème en haut d'écran,
   en bichromie à la couleur du thème et fondue dans le noir, et un grand chiffre à la place du titre.
   Photos dans public/bilan/<thème>.webp. */
export const DIM_PHOTO: Record<PersonalDim, string> = { stress: "stress", sleep: "sommeil", recovery: "recup", motivation: "envie" };
export const LEVER_PHOTO: Record<string, string> = { screen_late: "ecran", caffeine_late: "cafeine", heavy_meal: "repas", tobacco: "tabac", travel: "voyage", late_sleep: "sommeil", stretching: "stretch", walk: "marche", reading: "lecture", meditation: "meditation", cold_shower: "douche", hydration: "hydratation" };
const BLUE = "#9fd0ff", GREEN = "#9ff0ad";
export const PHOTO_ACCENT: Record<string, string> = {
  raison: "#f3e2bb", stress: "#ffb08a", sommeil: "#b3c6ff", soiree: "#d8b4ff", envie: "#ffd27a", recup: "#9be8f0",
  regularite: "#ffb08a", charge: "#a0ebcd", ressenti: BLUE, biais: "#ffd27a", tendance: BLUE, tests: "#ffb08a", suivre: "#d8b4ff", prochaine: "#a0ebcd",
  groupe_decroche: "#ffb08a", groupe_seances: "#ffd27a", groupe_conseils: "#f3e2bb",
  ecran: BLUE, cafeine: BLUE, repas: BLUE, tabac: "#d2d2d7", voyage: "#d2d2d7", stretch: GREEN, marche: GREEN, lecture: GREEN, meditation: GREEN, douche: GREEN, hydratation: GREEN, reveil: GREEN,
};
/* Une photo pour chaque écran (2026-11-03, Gildas : « une image pour absolument toutes les slides »). */
export function photoFor(s: AnySlide): string {
  switch (s.kind) {
    case "conseils": return "raison";
    case "predit": return s.lead ? DIM_PHOTO[s.lead.dim] : "stress";
    case "fatigue": return "soiree";
    case "leviers": { const k = s.rows[0]?.key; return (k && LEVER_PHOTO[k]) || (s.rows[0]?.positive ? "stretch" : "ecran"); }
    case "envie": return "envie";
    case "recup": return "recup";
    case "rythmes": return "sommeil";
    case "apercu": return photoFor(s.inner);
    case "g_decroche": return "groupe_decroche";
    case "g_seances": return "groupe_seances";
    case "g_appris": return "groupe_appris";
    case "g_conseils": return "groupe_conseils";
    case "g_charge": return "groupe_charge";
    default: return s.kind;
  }
}
/* Régularité et Charge (2026-11-03, Gildas) : la photo du sport du sportif (même image que son
   onboarding), passée en bichromie en CSS : gris × couleur claire (multiply), puis éclairci vers la
   couleur sombre (lighten). */
export const SPORT_TINT: Partial<Record<AnySlide["kind"], [string, string]>> = { regularite: ["#280c02", "#ffa578"], charge: ["#041c16", "#a0ebcd"], tests: ["#280c02", "#ffa578"] };
/* Tests : la photo suit le test affiché (2026-11-03, Gildas : « Épaulé-jeté +13 % avec un sprinter derrière »). */
const TEST_ILLU: [RegExp, string][] = [
  [/2 000 m|aviron/, "aviron"], [/vitesse|sprint|\d+\s?m\b/, "sprint"], [/d[ée]tente|saut|cmj|m[ée]decine|lancer/, "pliometrie"], [/vma|l[ée]ger|cooper/, "course"],
  [/ftp/, "velo"], [/\bnage\b/, "natation"], [/suspension|poutre/, "escalade"],
  [/gainage|chaise|rotation|pointes/, "mobilite"], [/pompes|tractions/, "gym"], [/squat|arrach|[ée]paul|d[ée]velopp|soulev/, "crossfit"],
];
/* Photo du sport prise dans la bibliothèque d'illustrations de l'app (2026-11-03, Gildas : « je fais du
   sprint et j'ai un mec qui fait un footing »), sinon la couverture de programme de son sport. */
const SPORT_ILLU: [RegExp, string][] = [
  [/vitesse|sprint/, "sprint"], [/saut|pliom|puissance|explosiv/, "pliometrie"], [/halt|power|muscu|crossfit|fitness/, "crossfit"],
  [/calisth|gymnast/, "gym"], [/hyrox|perte de poids|police|gendarm|pompier|gign|arm[ée]e/, "circuit"], [/trail/, "trail"],
  [/\bv[ée]lo\b|cyclis|bmx/, "velo"], [/natation/, "natation"], [/aviron/, "aviron"], [/ski/, "ski"], [/hockey/, "hockey"],
  [/martia|combat|\bmma\b/, "mma"], [/boxe/, "boxe"], [/judo/, "judo"],
  /* Sport tapé dans la recherche IA (« Autre - X ») ou famille large (2026-11-04) : chaque sport collectif a sa
     photo (un handballeur voyait du foot), tennis/padel/surf ont la leur, la prépa physique générale va au cross-training. */
  [/tennis/, "tennis"], [/padel/, "padel"], [/surf/, "surf"],
  [/pr[ée]paration physique|polyvalent|cross-training|hybrid|d[ée]velopp[ée]/, "crossfit"],
  [/escalade/, "escalade"], [/golf/, "golf"], [/voile/, "voile"], [/[ée]quitation/, "equitation"],
  [/hand/, "handball"], [/basket/, "basket"], [/rugby/, "rugby"], [/volley/, "volley"],
  [/collectif|baseball|foot/, "collectif"], [/pr[ée]vention|r[ée][ée]ducation|mobilit/, "mobilite"], [/endurance|triathlon|course/, "course"],
];
/* Cadrage vertical des illustrations en portrait (2026-11-03) : le bandeau est large, il faut viser le
   sportif, pas le haut de l'image (le filet au-dessus de l'athlète de crossfit). */
const ILLU_Y: Record<string, string> = { crossfit: "62%", sprint: "48%", pliometrie: "58%", course: "42%", velo: "68%", circuit: "60%", collectif: "45%", mobilite: "45%", escalade: "40%", equitation: "30%" };
export const illuPos = (src: string) => { const k = src.match(/illustrations\/([a-z]+)\.jpg/)?.[1]; return `center ${(k && ILLU_Y[k]) || "35%"}`; };
export function sportIllustration(sport: string | null | undefined): string | null {
  const v = (sport ?? "").toLowerCase();
  const hit = v ? SPORT_ILLU.find(([re]) => re.test(v)) : undefined;
  return hit ? `/illustrations/${hit[1]}.jpg` : null;
}
export function sportPhotoFor(s: AnySlide, sport: string | null | undefined): { src: string; tint: [string, string] } | null {
  if (s.kind === "tests") {
    const hit = TEST_ILLU.find(([re]) => re.test(s.main.name.toLowerCase()));
    return hit ? { src: `/illustrations/${hit[1]}.jpg`, tint: SPORT_TINT.tests! } : null;
  }
  const tint = SPORT_TINT[s.kind], src = sportIllustration(sport) ?? sportCover(sport);
  return tint && src ? { src, tint } : null;
}
/* Deux photos par thème (2026-11-03, Gildas) : le bilan du mois prend l'autre photo, pour que les bilans
   ne se ressemblent pas d'une période à l'autre (public/bilan/<thème>-2.webp). */
/* `alt` (mini bilans du point forme et de fin de séance, 2026-11-04) : la photo 2 un jour sur deux, pour ne
   pas revoir le même écran chaque matin. */
export function PhotoBanner({ photo, height, sportPhoto, period, alt }: { photo: string; height: string | number; sportPhoto?: { src: string; tint: [string, string] } | null; period?: BilanPeriodKind; alt?: boolean }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height, pointerEvents: "none", overflow: "hidden", isolation: "isolate" }}>
      {sportPhoto
        ? <div style={{ position: "absolute", inset: 0, background: sportPhoto.tint[1] }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${sportPhoto.src})`, backgroundSize: "cover", backgroundPosition: illuPos(sportPhoto.src), filter: "grayscale(1) contrast(1.3) brightness(1.2)", mixBlendMode: "multiply" }} />
            <div style={{ position: "absolute", inset: 0, background: sportPhoto.tint[0], mixBlendMode: "lighten" }} />
          </div>
        : <div style={{ position: "absolute", inset: 0, backgroundImage: `url(/bilan/${photo}${period === "month" || alt ? "-2" : ""}.webp)`, backgroundSize: "cover", backgroundPosition: "center" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(7,10,13,.5) 0%, rgba(7,10,13,.05) 30%, rgba(7,10,13,.55) 64%, #070a0d 100%)" }} />
    </div>
  );
}
/* Écrans d'exemple (onboarding, premier bilan) : les chiffres sont ceux d'un autre sportif, voire
   illustratifs. Le grand chiffre le dit au-dessus (« Chez un sportif ThePerfClub ») et l'écran se
   termine sur la promesse (2026-11-03, Gildas : jamais présenté comme ses données). */
export const ExampleCtx = createContext(false);
/* Les écrans d'exemple parlent de « ce sportif » (3e personne) : « sa séance », jamais « ta séance ». */
export const EXAMPLE_N = "ce sportif";
export function ExamplePromise({ n }: { n?: string }) {
  return <div style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{n ? `Le bilan de ${n} mesurera le sien.` : "Ton bilan mesurera le tien."}</div>;
}
/* Le grand chiffre et sa phrase forment le titre de l'écran (h2). */
export function Hero({ big, unit, cap, color }: { big: string | number; unit?: string; cap: string; color: string }) {
  const example = useContext(ExampleCtx);
  return (
    <h2 style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {example && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>Chez un sportif ThePerfClub</span>}
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(56px, 9.4vh, 80px)", lineHeight: 0.92, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color, textShadow: "0 2px 18px rgba(0,0,0,.45)" }}>{big}{unit && <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: 0, opacity: 0.85 }}> {unit}</span>}</span>
      <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3, color: "#fff", textWrap: "balance" } as React.CSSProperties}>{cap.replace(/ ([:;!?])/g, "\u00a0$1")}</span>
    </h2>
  );
}

function Bars({ bars, height = 140, color = "#ff6a2b", dim = "rgba(255,255,255,0.28)", showValues = false }: { bars: { label: string; value: number; display: string; highlight?: boolean }[]; height?: number; color?: string; dim?: string; showValues?: boolean }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  const min = showValues ? Math.min(...bars.map(b => b.value)) * 0.8 : 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: bars.length > 12 ? 3 : 10, height: height + (showValues ? 40 : 22) }} role="img" aria-label={bars.map(b => `${b.label} ${b.display}`).join(", ")}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
          {showValues && <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{b.display}</div>}
          <div style={{ width: "100%", height: Math.max(4, ((b.value - min) / (max - min || 1)) * height), borderRadius: bars.length > 12 ? 3 : 7, background: b.highlight || !showValues ? color : dim }} />
          <div style={{ minHeight: 14, fontSize: 11, lineHeight: "14px", color: "rgba(255,255,255,0.5)", whiteSpace: bars.length <= 5 ? "normal" : "nowrap", textAlign: "center" }}>{bars.length <= 12 || (i > 0 ? bars[i - 1].label !== b.label : true) ? b.label : ""}</div>
        </div>
      ))}
    </div>
  );
}

function Rows({ rows, color }: { rows: { label: string; part: number; total: number; highlight?: boolean; unit?: string }[]; color: string }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.78)" }}><span>{r.label}</span><b style={{ color: "#fff", whiteSpace: "nowrap" }}>{r.part} {r.unit ?? "sur"} {r.total}</b></div>
          <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: `${Math.max(3, (r.part / r.total) * 100)}%`, height: "100%", borderRadius: 6, background: r.highlight ? color : "rgba(255,255,255,0.45)" }} /></div>
        </div>
      ))}
    </>
  );
}

/* Pluriel des mots de difficulté (« très dure » → « très dures ») ; null si le mot manque : jamais de
   « s » orphelin ni de « undefineds » à l'écran. */
const plural = (w: string | null | undefined) => (w ? w.split(" ").map(x => (x === "très" ? x : `${x}s`)).join(" ") : null);

type Recal = { state: "idle" | "saving" | "done" | "kept" | "error"; apply: (dir: "low" | "high", shift: number) => void; keep: () => void };
/* Bilan vu par le coach (2026-10-24) : `n` = prénom du sportif, tout passe à la 3e personne. Registre
   impersonnel des deux côtés (2026-10-24 soir) : ni « je » ni « l'app ». Le recalage reste au
   sportif : le coach voit l'état. */
export function SlideBody({ s, bilan, onShare, shared, recal, n, onPlanning }: { s: BilanSlide; bilan: Bilan; onShare: () => void; shared: boolean; recal: Recal; n?: string; onPlanning?: () => void }) {
  const T = <A, B>(you: A, them: B): A | B => (n ? them : you);
  switch (s.kind) {
    case "conseils": {
      /* Wording 2026-11-03 (POC GSXeRzonoyn2UdnD46L9ML) : un titre, la frise, deux constats courts, une
         question oui / non pour le recalage. Registre impersonnel : ni « je » ni « l'app ». */
      const right = s.strip.filter(c => outcomeRight(c.outcome)).length;
      const r = s.recal;
      const verb = r?.dir === "high" ? "pousser" : "alléger";
      const Fact = ({ when, what }: { when: string; what: string }) => <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={small}>{when}</span><b style={{ fontSize: 15, color: "#fff" }}>{what}</b></div>;
      return (<>
        {/* 2026-11-03 : le titre porte sur la frise (dernières séances jugées), les constats sur tout
            l'historique. Les deux portées sont écrites, sinon « 14 sur 14 » puis « 9 sur 30 » se contredisent. */}
        <Hero big={right} unit={`sur ${s.strip.length}`} cap={`dernières séances où le conseil du matin a vu juste.`} color={PHOTO_ACCENT.raison} />
        <div style={card}>
          <Dots color={PHOTO_ACCENT.raison} items={s.strip.map(c => ({ on: !!outcomeRight(c.outcome), label: `${c.date} : ${outcomeRight(c.outcome) ? "vu juste" : "à côté"}`, onClick: n || !c.id ? undefined : () => requestPhysioReplay({ kind: "session", sessionId: c.id! }) }))} />
          <Legend>✓ vu juste · pointillé : à côté · de la plus ancienne à la plus récente</Legend>
        </div>
        {(s.none.total >= 3 || s.low.judged >= 3 || s.high.judged >= 3) && (
          <div style={{ ...card, gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Sur tout {T("ton", "son")} historique</div>
            {s.none.total >= 3 && <Fact when="Les jours sans conseil" what={`Séance comme prévu : ${s.none.same} fois sur ${s.none.total}`} />}
            {s.low.judged >= 3 && <Fact when="Les jours où alléger était conseillé" what={`Séance vraiment trop dure : ${s.low.justified} fois sur ${s.low.judged}`} />}
            {s.high.judged >= 3 && <Fact when="Les jours où pousser était conseillé" what={`Séance bien passée : ${s.high.right} fois sur ${s.high.judged}`} />}
          </div>
        )}
        {s.trend.length >= 2 && (
          <div style={card}>
            <div style={small}>Vu juste, mois par mois</div>
            <Bars bars={s.trend.map((t, i) => ({ label: `${t.label}${t.recal ? " ↻" : ""}`, value: t.rate, display: `${t.rate} %`, highlight: i === s.trend.length - 1 }))} height={80} color="#7ee08f" dim="rgba(126,224,143,0.35)" showValues />
            {s.trend.some(t => t.recal) && <div style={small}>↻ mois où le conseil a été recalé.</div>}
          </div>
        )}
        {n && (s.currentShift > 0 || s.currentShiftHigh > 0 || r) && (
          <div style={{ ...card, gap: 8 }}>
            <div style={{ fontSize: 15, lineHeight: 1.45, color: "#fff" }}>{s.currentShift > 0 || s.currentShiftHigh > 0
              ? `${n} a choisi de recaler ses conseils : ${[s.currentShift > 0 ? "alléger n'est proposé que sur une vraie baisse" : null, s.currentShiftHigh > 0 ? "pousser n'est proposé que sur une vraie forme" : null].filter(Boolean).join(", ")}.`
              : `Quand ${verb} était conseillé, ${n} a souvent tenu sa séance sans problème. Un réglage plus strict lui est proposé, c'est ${n} qui décide.`}</div>
          </div>
        )}
        {!n && r && recal.state !== "kept" && (
          <div style={{ ...card, gap: 8 }}>
            {recal.state === "done"
              ? <div style={{ fontSize: 15, lineHeight: 1.45, color: "#fff" }}>{r.dir === "high" ? "C'est noté : pousser ne sera conseillé que sur une vraie forme." : "C'est noté : alléger ne sera conseillé que sur une vraie baisse."} Le bilan dira si c&apos;était le bon réglage.</div>
              : <>
                <div style={{ fontSize: 15, lineHeight: 1.45, color: "#fff" }}>{r.dir === "high" ? "Quand pousser était conseillé, ta séance est souvent restée dure." : "Quand alléger était conseillé, tu as souvent tenu ta séance sans problème."}</div>
                <div style={small}>{r.dir === "high" ? "Ne te conseiller de pousser que si ta forme est nettement au-dessus de ta norme ?" : "Ne te conseiller d'alléger que si ta récup baisse nettement ?"}</div>
              </>}
            {recal.state === "error" && <div style={{ ...small, color: "#ffb59a" }}>Impossible d&apos;enregistrer. Réessaie dans un instant.</div>}
            {(recal.state === "idle" || recal.state === "error" || recal.state === "saving") && (
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button onClick={recal.keep} style={{ flex: 1, height: 46, borderRadius: 12, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Non, garder</button>
                <button onClick={() => recal.apply(r.dir === "high" ? "high" : "low", r.shift)} disabled={recal.state === "saving"} style={{ flex: 1.4, height: 46, borderRadius: 12, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{recal.state === "saving" ? "…" : "Oui"}</button>
              </div>
            )}
          </div>
        )}
      </>);
    }
    case "suivre": {
      const diff = s.followed.felt - s.ignored.felt;
      const bars = [{ label: `${T("Tu as allégé", "Allégé")} (${s.followed.n} fois)`, value: s.followed.felt, display: String(round(s.followed.felt)), highlight: true }, { label: `${T("Tu as gardé ta séance", "Séance gardée")} (${s.ignored.n} fois)`, value: s.ignored.felt, display: String(round(s.ignored.felt)) }];
      const subtitle = Math.abs(diff) < 5 ? (s.shifted ? T("C'est pour ça que tes alertes sont devenues plus rares.", "C'est pour ça que ses alertes sont devenues plus rares.") : null) : diff > 0 ? T("Les jours d'alerte, alléger vaut le coup.", `Les jours d'alerte, alléger vaut le coup pour ${n}.`) : T("Tu encaisses ces séances : les alertes peuvent être plus rares.", `${n} encaisse ces séances : les alertes peuvent être plus rares.`);
      return (<>
        {Math.abs(diff) >= 5 && diff > 0
          ? <Hero big={`+${round(diff)}`} cap={`de forme le lendemain quand ${T("tu allèges", `${n} allège`)}, plutôt que de garder la séance.`} color={PHOTO_ACCENT.suivre} />
          : <h2 style={h2}>{Math.abs(diff) < 5 ? <>Alléger ou pas, <span style={{ color: "#c79bf7" }}>{T("ton", "son")} lendemain est le même.</span></> : <>{T("Garder ta séance", "Garder sa séance")} <span style={{ color: "#c79bf7" }}>{T("ne t'a rien coûté.", `n'a rien coûté à ${n}.`)}</span></>}</h2>}
        {subtitle && <p style={sub}>{subtitle}</p>}
        <div style={card}><div style={small}>{T("Les jours d'alerte · ta forme ressentie le lendemain", "Les jours d'alerte · sa forme ressentie le lendemain")}</div><Bars bars={bars} height={100} color="#a855f7" dim="rgba(199,155,247,0.4)" showValues /></div>
      </>);
    }
    case "regularite": {
      const scope = bilan.period.kind === "week" ? "cette semaine" : bilan.period.kind === "month" ? "ce mois-ci" : "depuis le début";
      return (<>
        <Hero big={s.sessions} unit={`séance${s.sessions > 1 ? "s" : ""}`} cap={`et ${s.checkins} point${s.checkins > 1 ? "s" : ""} forme sur ${s.days} jours ${scope}.${s.noGap ? " Zéro semaine sautée." : ""}`} color={PHOTO_ACCENT.regularite} />
        <div style={card}><div style={small}>Charge d'entraînement {bilan.period.kind === "week" ? "par jour" : "par semaine"}</div><Bars bars={s.bars} height={120} /></div>
      </>);
    }
    case "charge": {
      /* 2026-11-03 : trop basse, dans ta zone, montée trop vite, comptés à part (avant : un seul « sortie
         de ta zone » qui se lisait comme un danger). Le titre suit la plus grosse catégorie. */
      const total = s.daysCounted, above = s.daysAbove ?? s.daysHigh, low = s.daysLow ?? 0, inZone = Math.max(0, total - above - low);
      const tooFast = above / total >= 0.15, margin = !tooFast && low / total >= 0.25 && above / total < 0.1;
      const Row = ({ label, days, color }: { label: string; days: number; color: string }) => (<>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.8)" }}><span>{label}</span><b style={{ color: "#fff" }}>{days} jour{days > 1 ? "s" : ""}</b></div>
        <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: `${Math.max(2, (days / total) * 100)}%`, height: "100%", borderRadius: 5, background: color }} /></div>
      </>);
      return (<>
        {tooFast
          ? <Hero big={above} unit={`jour${above > 1 ? "s" : ""}`} cap={`où ${T("ta", "sa")} charge est montée trop vite.`} color="#ffb08a" />
          : margin ? <Hero big={low} unit={`sur ${total}`} cap={`jours sous ${T("ta", "sa")} zone : pas de risque de blessure, ${T("tu as", `${n} a`)} de la marge.`} color={PHOTO_ACCENT.charge} />
          : <Hero big={inZone} unit={`sur ${total}`} cap={`jours dans ${T("ta", "sa")} zone de charge : ${T("tu t'entraînes", `${n} s'entraîne`)} dur, sans ${T("t'enterrer", "s'enterrer")}.`} color={PHOTO_ACCENT.charge} />}
        {(tooFast || margin) && <p style={sub}>{tooFast ? T("Avant d'ajouter du volume, laisse ta charge se stabiliser une semaine.", "Avant d'ajouter du volume, laisse sa charge se stabiliser une semaine.") : T("Tu peux ajouter une séance légère par semaine.", `${n} peut ajouter une séance légère par semaine.`)}</p>}
        <div style={card}>
          <div style={small}>{T("Ta", "Sa")} dernière semaine, comparée à {T("ton", "son")} mois · {total} jours</div>
          <Row label="Trop basse" days={low} color="#8cc4f5" />
          <Row label={T("Dans ta zone", "Dans sa zone")} days={inZone} color="#fff" />
          <Row label="Montée trop vite" days={above} color="#ff6a2b" />
        </div>
      </>);
    }
    case "ressenti":
      return (<>
        {s.crashes >= 3
          ? <Hero big={s.crashesSeen} unit={`sur ${s.crashes}`} cap={`chutes de VFC que ${T("ton", "son")} point forme avait vues aussi : ${T("ton", "son")} ressenti vaut une montre.`} color={PHOTO_ACCENT.ressenti} />
          : <h2 style={h2}>{T("Ton", "Son")} ressenti <span style={{ color: "#8cc4f5" }}>vaut une montre.</span></h2>}
        <div style={card}><div style={small}>Sommeil mesuré, selon {T("ta", "sa")} réponse au réveil</div><Bars bars={s.sleepBars} height={100} color="#6da7ec" dim="rgba(109,167,236,0.4)" showValues /></div>
      </>);
    case "predit": {
      /* 2026-11-03 : le titre nomme la cause et le type de séance ; les lignes disent ce qui est compté. */
      const L = s.lead ? PREDIT_WORDS[s.lead.dim] : null;
      return (<>
        {L && s.lead && s.blocks[0]?.rows[0]
          ? <Hero big={s.blocks[0].rows[0].part} unit={`sur ${s.blocks[0].rows[0].total}`} cap={`${L.low.replace(/^Les /, "").replace(/^./, x => x.toLowerCase())} où ${T("ta", "sa")} séance de ${s.lead.noun} a été plus dure que prévu.`} color={PHOTO_ACCENT[DIM_PHOTO[s.lead.dim]]} />
          : <h2 style={h2}>Ce qui rend {T("tes", "ses")} séances <span style={{ color: "#ff8a5c" }}>plus dures que prévu.</span></h2>}
        {L && s.lead && <p style={sub}>{L.low}, {T(`ton conseil du matin allège déjà ta séance de ${s.lead.noun}.`, `son conseil du matin allège déjà sa séance de ${s.lead.noun}.`)}</p>}
        {s.blocks.map((b, i) => {
          const dim = (Object.keys(PREDIT_WORDS) as PersonalDim[]).find(d => b.title.includes(DIM_HINT[d])) ?? null;
          const W = dim ? PREDIT_WORDS[dim] : null;
          const fam = b.title.split(" · ")[0];
          return <div key={i} style={card}><div style={small}>{fam} · séances ressenties plus dures que prévu</div><Rows rows={b.rows.map((r, j) => ({ ...r, label: W ? (j === 0 ? W.low : W.high) : r.label, unit: "fois sur" }))} color="#ff6a2b" /></div>;
        })}
      </>);
    }
    case "biais":
      return (<>
        <Hero big={s.harder} unit={`sur ${s.total}`} cap={plural(s.planned) && plural(s.feltWord) ? `séances prévues ${plural(s.planned)}, ${T("ressenties", "ressenties")} ${plural(s.feltWord)}.` : "séances ressenties plus dures que prévu."} color={PHOTO_ACCENT.biais} />
        <p style={sub}>{T("Prévois-les un cran plus haut.", "Prévois-les un cran plus haut pour lui.")}</p>
        <div style={card}>
          <div style={small}>Prévu (trait) et ressenti (barre)</div>
          <div style={{ display: "flex", gap: 7, alignItems: "flex-end", height: 160 }} role="img" aria-label={`${s.harder} séances sur ${s.total} plus dures que prévu`}>
            {s.points.map((p, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ position: "relative", width: "100%", height: 130, display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: p.felt * 13, borderRadius: 6, background: p.felt > p.planned ? "#f28a00" : "rgba(255,255,255,0.3)" }} />
                  <div style={{ position: "absolute", left: -2, right: -2, bottom: p.planned * 13, height: 3, borderRadius: 2, background: "#fff" }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
          {s.accurate && <div style={{ ...card, gap: 2 }}><b style={{ fontSize: 22, color: "#fff" }}>{s.accurate.ok} fois sur {s.accurate.total}</b><span style={small}>{plural(s.accurate.planned) ? `prévues ${plural(s.accurate.planned)}, ressenties comme prévu` : "ressenties comme prévu"}</span></div>}
        </div>
      </>);
    case "fatigue": {
      /* 2026-11-03 : chaque barre part de « le matin… » (la barre « Soirée » montrait en fait le lendemain). */
      const hardFree = s.hard && Math.abs(s.hard.hard - s.hard.easy) < 5;
      return (<>
        <Hero big={`−${round(s.normScore - s.nextScore)}`} cap={`de forme le lendemain d'une soirée (alcool ou sortie).${s.hard ? ` Une grosse séance : ${hardFree ? "presque rien" : `−${round(Math.max(0, s.hard.easy - s.hard.hard))}`}.` : ""}`} color={PHOTO_ACCENT.soiree} />
        <p style={sub}>{T("Séance clé le lendemain ? Décale la soirée, pas l'entraînement.", `Séance clé le lendemain ? Mieux vaut que ${n} décale la soirée, pas l'entraînement.`)}</p>
        <div style={card}>
          <div style={small}>{T("Ta", "Sa")} forme ressentie</div>
          <DayCurve norm={s.normScore} next={s.nextScore} after={s.afterScore} color="#a855f7" normLabel={T("ta forme habituelle", "sa forme habituelle")} />
          {s.hrv && <div style={small}>{T("Ta", "Sa")} montre voit pareil : VFC {round(s.hrv.norm)} → {round(s.hrv.next)} ms le lendemain.</div>}
        </div>
      </>);
    }
    case "leviers": {
      /* 2026-11-03 : un lien observé, pas une cause (« les soirs de… tu dors »), et le test à faire en sous-titre. */
      const top = s.rows[0];
      const when = (top.key && LEVER_WHEN[top.key]) || `Avec ${top.label.toLowerCase()}`;
      const amount = top.delta.replace(/^[+−]/, "");
      return (<>
        {(() => { const [num, ...u] = amount.split(" "); return <Hero big={`${top.positive ? "+" : "−"}${num}`} unit={u.join(" ") || undefined} cap={`${s.unit === "sleep" ? "de sommeil" : "de forme"} ${when.charAt(0).toLowerCase()}${when.slice(1)}.`} color={PHOTO_ACCENT[photoFor(s) ?? "stretch"]} />; })()}
        <p style={sub}>{top.key === "travel" ? T("Après un voyage, garde ta séance clé pour le surlendemain.", "Après un voyage, mieux vaut garder sa séance clé pour le surlendemain.") : top.positive ? T("Teste 2 semaines d'affilée. Le bilan dira si ça tient.", "À tester 2 semaines d'affilée. Le bilan dira si ça tient.") : T("Essaie 2 semaines sans. Le bilan dira si ça tient.", "À tester 2 semaines sans. Le bilan dira si ça tient.")}</p>
        {/* Mêmes jauges que l'onglet Récupération > Comportements (aide à droite, pénalise à gauche). */}
        {(() => { const num = (d: string) => Number(d.replace("−", "-").replace(/[^\d.+-]/g, "")) || 0; const maxAbs = Math.max(...s.rows.map(r => Math.abs(num(r.delta))), s.unit === "sleep" ? 20 : 5); return (
          <div style={{ ...card, gap: 0 }}>
            <div style={{ ...small, marginBottom: 4 }}>{s.unit === "sleep" ? `Sommeil mesuré par ${T("ta", "sa")} montre` : `${T("Ta", "Sa")} forme`}, hors soirées (alcool ou sortie)</div>
            {s.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 0", borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{(r.key && BEHAVIOR_META[r.key]?.emoji) || "•"}</div>
                <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", minWidth: 0 }}>{r.label}</span>
                    {impactPill(num(r.delta), r.delta)}
                  </div>
                  <ImpactBar impact={num(r.delta)} maxAbs={maxAbs} />
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>Avec : {r.with} · Sans : {r.without}</span>
                </div>
              </div>
            ))}
          </div>); })()}
        <div style={small}>Observé sur {s.unit === "sleep" ? T("tes", "ses") : T("ta", "sa")} {s.unit === "sleep" ? "nuits" : "forme"}, pas encore prouvé.</div>
      </>);
    }
    case "tendance": {
      const last = s.months[s.months.length - 1];
      return (<>
        <Hero big={last.display} cap={`de forme moyenne en ${last.label.replace(".", "")} : ${s.direction === "down" ? `${T("ta", "sa")} forme baisse.${s.lateNights ? ` ${T("Tes", "Ses")} couchers reculent.` : ""}` : s.direction === "up" ? `${T("ta", "sa")} forme remonte.` : `${T("ta", "sa")} forme est stable.`}`} color={PHOTO_ACCENT.tendance} />
        <div style={card}><div style={small}>Forme moyenne par mois</div><Bars bars={s.months} height={90} color="#6da7ec" dim="rgba(109,167,236,0.45)" showValues /></div>
        {s.lateNights && <div style={card}><div style={small}>Couchers après minuit</div><Bars bars={s.lateNights} height={50} color="#f28a00" dim="rgba(109,167,236,0.45)" showValues /></div>}
      </>);
    }
    case "tests": {
      const pts = s.main.points, vs = pts.map(p => p.value);
      const mn = Math.min(...vs), mx = Math.max(...vs), W = 300, H = 120;
      const xy = pts.map((p, i) => [16 + (i / Math.max(1, pts.length - 1)) * (W - 32), 20 + (1 - (p.value - mn) / (mx - mn || 1)) * (H - 40)]);
      const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
      return (<>
        <Hero big={`+${s.main.pct}`} unit="%" cap={`${s.main.name}, depuis ${T("ton", "son")} premier test.`} color={PHOTO_ACCENT.tests} />
        <div style={card}>
          <svg width="100%" height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`${s.main.name} : ${pts.map(p => fmt(p.value)).join(", ")}`}>
            <polyline points={xy.map(p => p.join(",")).join(" ")} fill="none" stroke="#ff6a2b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {xy.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="6" fill={i === xy.length - 1 ? "#ff6a2b" : "#14181b"} stroke="#ff6a2b" strokeWidth="3" /><text x={p[0]} y={p[1] - 12} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">{fmt(pts[i].value)}</text><text x={p[0]} y={H + 18} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">{`${Number(pts[i].date.slice(8))}/${Number(pts[i].date.slice(5, 7))}`}</text></g>)}
          </svg>
        </div>
        {s.others.map((o, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px" }}><span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{o.name}</span><span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{o.from} → {o.to} <span style={{ color: "#7ee08f" }}>+{o.pct} %</span></span></div>)}
      </>);
    }
    case "envie": {
      const okRate = s.ok.part / s.ok.total;
      return (<>
        {okRate >= 0.6
          ? <Hero big={s.ok.part} unit={`sur ${s.ok.total}`} cap={`jours sans envie où ${T("ta", "sa")} séance est passée comme prévu.`} color={PHOTO_ACCENT.envie} />
          : <Hero big={s.ok.total - s.ok.part} unit={`sur ${s.ok.total}`} cap={`jours sans envie où ${T("ta", "sa")} séance a coincé.`} color={PHOTO_ACCENT.envie} />}
        <p style={sub}>{okRate >= 0.6 ? T("Lance au moins l'échauffement, la suite vient.", "Qu'il lance au moins l'échauffement, la suite vient.") : T("Ces jours-là, alléger n'a rien d'un manque de volonté.", "Ces jours-là, alléger n'a rien d'un manque de volonté.")}</p>
        <div style={{ ...card, gap: 12 }}>
          <span style={small}>Pas envie, mais le corps en état</span>
          <Dots color={PHOTO_ACCENT.envie} items={Array.from({ length: s.ok.total }, (_, i) => ({ on: i < s.ok.part, label: i < s.ok.part ? "séance comme prévu" : "séance plus dure" }))} />
          <Legend>✓ séance comme prévu · pointillé : plus dure</Legend>
          {s.tired && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>Pas envie, et le corps fatigué : séance plus dure {s.tired.part} fois sur {s.tired.total}.</div>}
        </div>
      </>);
    }
    case "recup": {
      const [a, b] = s.families;
      const inDays = (d: number) => d === 1 ? "dès le lendemain" : d > 3 ? "en plus de 3 jours" : `en ${d} jours`;
      return (<>
        {a.days <= 3
          ? <Hero big={a.days} unit={a.days === 1 ? "nuit" : "jours"} cap={`pour récupérer d'une grosse séance de ${a.noun}.`} color={PHOTO_ACCENT.recup} />
          : <Hero big="3+" unit="jours" cap={`pour récupérer d'une grosse séance de ${a.noun}.`} color={PHOTO_ACCENT.recup} />}
        {b && b.days !== a.days && <p style={sub}>{T("Ta", "Sa")} séance de {b.noun}, elle, est récupérée {inDays(b.days)}.</p>}
        {s.families.map((f, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{f.noun.replace(/^./, x => x.toUpperCase())}, séance très dure</div>
            <DayFrise steps={f.steps} color={PHOTO_ACCENT.recup} />
          </div>
        ))}
        <div style={small}>Forme ressentie, comparée à {T("ta", "sa")} forme habituelle ({round(s.norm)}).</div>
      </>);
    }
    case "rythmes":
      return (<>
        {s.nights && (!s.worst || s.today)
          ? <Hero big={s.nights.two.part} unit={`sur ${s.nights.two.total}`} cap="séances plus dures que prévu après deux mauvaises nuits d'affilée." color={PHOTO_ACCENT.sommeil} />
          : s.worst && s.days
          ? (() => { const avg = s.days.reduce((a, b) => a + b.value, 0) / s.days.length, w = s.days.find(d => d.highlight); return <Hero big={`−${round(avg - (w?.value ?? avg))}`} cap={`de forme ${T("tes", "ses")} ${s.worst} : ${T("tes", "ses")} pires jours.`} color={PHOTO_ACCENT.sommeil} />; })()
          : <h2 style={h2}>Une mauvaise nuit passe. <span style={{ color: "#ff8a5c" }}>Deux d&apos;affilée, non.</span></h2>}
        {s.worst && (s.soireeShare >= 0.4 || s.next) && <p style={sub}>{s.soireeShare >= 0.4 ? "Souvent le lendemain d'une soirée (alcool ou sortie)." : `Une séance dure ce jour-là passerait mieux le ${s.next}.`}</p>}
        {s.days && <div style={card}><div style={small}>Forme ressentie moyenne, par jour</div><Bars bars={s.days} height={90} color="#ff6a2b" dim="rgba(255,255,255,0.3)" showValues /></div>}
        {s.nights && <div style={{ ...card, gap: 12 }}>
          {([["Après une mauvaise nuit", s.nights.one], ["Après deux mauvaises nuits d'affilée", s.nights.two]] as const).map(([l, v]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={small}>{l} · {v.part} sur {v.total}</span>
              <Dots color={PHOTO_ACCENT.sommeil} mark="!" items={Array.from({ length: v.total }, (_, i) => ({ on: i < v.part, label: i < v.part ? "séance plus dure que prévu" : "séance comme prévu" }))} /></div>
          ))}
          <Legend>! séance plus dure que prévu · pointillé : comme prévu</Legend>
        </div>}
      </>);
    case "prochaine":
      return (<>
        {(() => { const k = s.rows.filter(r => r.flag).length; return <Hero big={k} unit={`séance${k > 1 ? "s" : ""}`} cap={`de ${T("ta", "sa")} semaine qui vient à revoir, d'après ce que ${T("tes", "ses")} données ont appris.`} color={PHOTO_ACCENT.prochaine} />; })()}
        <div style={{ ...card, gap: 12 }}>
          {s.rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: 10, fontSize: 14 }}>
              <b style={{ color: "#fff" }}>{r.label}</b>
              <span style={{ color: "rgba(255,255,255,0.85)", minWidth: 0 }}>{r.name}
                <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: r.flag ? "#ffb38a" : "rgba(255,255,255,0.55)" }}>{r.flag ? `▲ ${r.flag}` : "✓ Rien à signaler"}</span>
              </span>
            </div>
          ))}
        </div>
        {onPlanning && <button onClick={onPlanning} style={{ height: 48, borderRadius: 14, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Ouvrir mon planning</button>}
      </>);
    case "apercu":
      /* Aperçu (2026-11-03) : tant que ses propres écrans n'ont pas assez de données, un écran d'exemple
         choisi par sa réponse du matin (mêmes cartes que l'étape bilan de l'onboarding). Jamais flouté. */
      return (<>
        <ExampleCtx.Provider value={true}>
          <SlideBody s={s.inner} bilan={bilan} onShare={onShare} shared={shared} recal={recal} n={EXAMPLE_N} />
        </ExampleCtx.Provider>
        <ExamplePromise n={n} />
      </>);
    case "partage":
      return (<>
        <div style={{ borderRadius: 22, padding: "22px 20px", background: "linear-gradient(160deg, #2a1206 0%, #14181b 55%, #0c1a26 100%)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#ff8a5c" }}>{bilan.title.toUpperCase()}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, lineHeight: 1.15, color: "#fff" }}>M'entraîner à ma forme du jour</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {s.kpis.map((k, i) => <div key={i} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 22, color: "#fff" }}>{k.value}</b><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}>{k.label}</span></div>)}
          </div>
          {s.line && <div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.8)" }}>{s.line}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)" }}><span>THEPERFCLUB</span><span>theperfclub.com</span></div>
        </div>
        <button onClick={onShare} style={{ height: 52, border: "none", borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{shared ? "Copié ✓" : "Partager mon bilan"}</button>
      </>);
  }
}

/* Écrans du bilan du groupe (2026-10-26). Jamais de moyenne du groupe : des prénoms, triés. Formes
   distinctes pour le daltonisme (plein, demi-hauteur, pointillé), toujours doublées de mots. */
const names = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`;
const pl = (k: number, w: string) => `${k} ${w}${k > 1 ? "s" : ""}`;
function Marks({ marks }: { marks: DayMark[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 16 }} role="img" aria-label={marks.map(m => (m === "ok" ? "fait" : m === "tired" ? "fait, fatigué" : "manqué")).join(", ")}>
      {marks.map((m, i) => <div key={i} style={{ flex: 1, boxSizing: "border-box", borderRadius: 3, height: m === "tired" ? 8 : 16, background: m === "ok" ? "#fff" : m === "tired" ? "#f28a00" : "transparent", border: m === "missed" ? "1.5px dashed rgba(255,255,255,0.55)" : "none" }} />)}
    </div>
  );
}
/* Prénom → bilan complet du sportif (2026-10-27), à la 3e personne, par-dessus le bilan du groupe. */
type OpenAthlete = (id: string, name: string) => void;
function AthleteLink({ id, name, open }: { id: string; name: string; open: OpenAthlete }) {
  return <button onClick={() => open(id, name)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", textDecoration: "underline", textUnderlineOffset: 3 }}>Bilan de {name} ›</button>;
}
function GroupSlideBody({ s, open }: { s: GroupSlide; open: OpenAthlete }) {
  switch (s.kind) {
    case "g_decroche": {
      const flagged = s.rows.filter(r => r.flag);
      return (<>
        {flagged.length
          ? <Hero big={flagged.length} unit={`sportif${flagged.length > 1 ? "s" : ""}`} cap={`à surveiller : ${names(flagged.map(r => r.name))}.`} color={PHOTO_ACCENT.groupe_decroche} />
          : <Hero big={s.rows.length} unit={`sur ${s.rows.length}`} cap="sportifs suivent : tout le groupe est là." color={PHOTO_ACCENT.groupe_decroche} />}
        <p style={body}>Les jours de séance : point forme fait, fait mais fatigué, ou manqué.</p>
        {s.rows.map((r, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{r.name}</span>
              {r.flag && <span style={{ fontSize: 13, fontWeight: 700, color: "#ffb38a" }}>{r.flag}</span>}
            </div>
            <Marks marks={r.marks} />
            <div style={small}>{r.missed ? `${pl(r.missed, "point")} forme manqué${r.missed > 1 ? "s" : ""}` : "Aucun point forme manqué"} sur {pl(r.days, "séance")}{r.tired ? `, fatigué ${pl(r.tired, "jour")}` : ""}.</div>
            <AthleteLink id={r.id} name={r.name} open={open} />
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#fff" }} />fait</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 6, borderRadius: 2, background: "#f28a00" }} />fait, fatigué</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, boxSizing: "border-box", border: "1.5px dashed rgba(255,255,255,0.6)" }} />manqué</span>
        </div>
        {flagged.length > 0 && s.regular > 0 && <div style={small}>{s.regular > 1 ? `Les ${s.regular} autres sportifs sont réguliers.` : "L'autre sportif est régulier."}</div>}
      </>);
    }
    case "g_seances": {
      const top = [...s.words].sort((x, y) => y.harder / y.total - x.harder / x.total)[0];
      const hard = top.harder / top.total >= 0.6;
      const up = (w: string) => ["légère", "modérée", "dure", "très dure"][Math.min(3, ["légère", "modérée", "dure", "très dure"].indexOf(w) + 1)];
      return (<>
        {hard
          ? <Hero big={top.harder} unit={`sur ${top.total}`} cap={`séances prévues ${plural(top.planned)}, ressenties ${plural(up(top.planned))}.`} color={PHOTO_ACCENT.groupe_seances} />
          : <h2 style={h2}>Tes séances <span style={{ color: "#7ee08f" }}>tombent juste.</span></h2>}
        <p style={body}>Ce que tu prévois, comparé à ce que tes sportifs ressentent, par niveau de difficulté prévue.</p>
        <div style={card}>
          {s.words.map((w, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Rows rows={[{ label: `Prévues ${plural(w.planned)} · plus dures que prévu`, part: w.harder, total: w.total, highlight: w === top && hard }]} color="#f28a00" />
              {w.who.length > 0 && <div style={small}>Surtout {names(w.who)}.</div>}
            </div>
          ))}
        </div>
        {s.same && <p style={{ ...body, fontSize: 14 }}>« {s.same.name} » en particulier : ressentie au-dessus de « {s.same.planned} » {s.same.harder} fois sur {s.same.total}, chez {s.same.athletes} sportifs. La noter un cran plus haut, ou l&apos;alléger.</p>}
      </>);
    }
    case "g_appris":
      return (<>
        {s.rows.length > 1
          ? <Hero big={s.rows.length} unit="signaux" cap={`différents pour ${s.rows.length} sportifs : chacun a les siens.`} color="#d8b4ff" />
          : <h2 style={h2}>Ce que ses données <span style={{ color: "#c9a2ff" }}>ont appris.</span></h2>}
        <p style={body}>{s.rows.length > 1 ? "Appris sur l'historique de chacun, pas sur une moyenne." : "L'enseignement le plus net de son historique."}</p>
        {s.rows.map((r, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{r.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#c9a2ff" }}>{r.topic}</span>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>{r.text}</div>
            <AthleteLink id={r.id} name={r.name} open={open} />
          </div>
        ))}
      </>);
    case "g_conseils":
      return (<>
        <Hero big={s.right} unit={`sur ${s.judged}`} cap="conseils du matin qui ont vu juste, dans tout le groupe." color={PHOTO_ACCENT.groupe_conseils} />
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{s.right} confirmés sur {s.judged}</div>
          <Rows rows={s.rows.map((r, i) => ({ label: r.name, part: r.right, total: r.judged, highlight: i === 0 }))} color="#7ee08f" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 4 }}>{s.rows.map(r => <AthleteLink key={r.id} id={r.id} name={r.name} open={open} />)}</div>
        </div>
        <p style={{ ...body, fontSize: 14 }}>Le sportif le moins bien lu apparaît en premier. Son seuil se recale tout seul avec ses séances.</p>
      </>);
    case "g_charge": {
      const up = s.rows.filter(r => r.above / r.days >= 0.3), down = s.rows.filter(r => r.below / r.days >= 0.3);
      return (<>
        <h2 style={h2}>{up.length ? <>{names(up.map(r => r.name))} <span style={{ color: "#ff8a5c" }}>{up.length > 1 ? "montent" : "monte"} trop vite.</span></> : down.length ? <>{names(down.map(r => r.name))} <span style={{ color: "#8cc4f5" }}>{down.length > 1 ? "manquent" : "manque"} de charge.</span></> : s.rows.some(r => r.above || r.below) ? <>Le groupe reste dans sa zone, <span style={{ color: "#7ee08f" }}>à quelques jours près.</span></> : <>Le groupe reste <span style={{ color: "#7ee08f" }}>dans sa zone.</span></>}</h2>
        <p style={body}>Chaque jour, la charge des 7 derniers jours comparée à celle des 4 dernières semaines.</p>
        {s.rows.filter(r => r.above || r.below).slice(0, 4).map((r, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{r.name}</div>
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 }}>
              {r.below > 0 && <div style={{ width: `${(r.below / r.days) * 100}%`, background: "rgba(140,196,245,0.55)" }} />}
              <div style={{ flex: 1, background: "#fff" }} />
              {r.above > 0 && <div style={{ width: `${(r.above / r.days) * 100}%`, background: "#ff6a2b" }} />}
            </div>
            <div style={small}>{[r.below ? `En dessous de sa zone ${pl(r.below, "jour")}` : null, r.above ? `${r.below ? "au-dessus" : "Au-dessus de sa zone"} ${pl(r.above, "jour")}` : null].filter(Boolean).join(", ")} sur {r.days}.</div>
            <AthleteLink id={r.id} name={r.name} open={open} />
          </div>
        ))}
        {(() => { const rest = s.rows.filter(r => !r.above && !r.below).length; return rest ? <div style={small}>{rest === s.rows.length ? (rest > 1 ? `Les ${rest} sportifs suivis sont restés dans leur zone tous les jours.` : "Resté dans sa zone tous les jours.") : rest > 1 ? `Les ${rest} autres sportifs sont restés dans leur zone tous les jours.` : "L'autre sportif est resté dans sa zone tous les jours."}</div> : null; })()}
      </>);
    }
  }
}

function lockSlide(node: React.ReactNode, surface: string, coach: boolean, onUnlock: () => void) {
  return (
    <LockedBlur locked surface={surface} onUnlock={onUnlock} top radius={18} title={coach ? "Ce que ses données ont appris" : "Ce que tes données ont appris"} cta={coach ? "Débloquer le bilan" : "Débloquer mon bilan"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{node}</div>
    </LockedBlur>
  );
}
const OPEN_SLIDES = new Set<string>(["regularite", "apercu"]);

export default function BilanCarousel({ userId, kind, anchor, today, source, subject, group = false, locked = false, onUnlock, onClose }: Props) {
  const router = useRouter();
  const n = subject?.name;
  const { close, exitClass } = useExitAnimation(onClose);
  const [bilan, setBilan] = useState<Bilan | GroupBilan | null>(null);
  const [drill, setDrill] = useState<{ athleteId: string; name: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [sport, setSport] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [shared, setShared] = useState(false);
  const [recalState, setRecalState] = useState<Recal["state"]>("idle");
  const recal: Recal = {
    state: recalState,
    apply: async (dir, shift) => {
      setRecalState("saving");
      // Journalisé côté serveur (profiles.autoreg_recal_events), comme le recalage automatique.
      const r = await fetch("/api/autoreg/recal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply: { dir, shift } }) }).catch(() => null);
      if (!r?.ok) { console.error("[bilan] recalage", r?.status); setRecalState("error"); return; }
      posthog.capture("autoreg_recalibrated", { shift, dir, period: kind, source: "manual" });
      setRecalState("done");
    },
    keep: () => { posthog.capture("autoreg_recalibration_declined", { period: kind }); setRecalState("kept"); },
  };
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (!group) return;
    let alive = true;
    (async () => {
      const r = await fetch(`/api/coach/group-bilan?today=${today}`).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!alive) return;
      if (!r?.ok) { console.error("[bilan groupe] lecture", j.error ?? r?.status); setFailed(true); return; }
      type RawAthlete = { id: string; name: string; profile: BilanRaw["profile"]; sessions: BilanSession[]; checkins: BilanCheckin[] };
      const athletes: GroupAthlete[] = ((j.athletes ?? []) as RawAthlete[]).map(a => ({
        id: a.id, name: a.name, signupAt: a.profile?.created_at ?? new Date().toISOString(),
        shift: a.profile?.autoreg_shift ?? 0, shiftHigh: a.profile?.autoreg_shift_high ?? 0, events: a.profile?.autoreg_recal_events ?? [],
        sessions: a.sessions, checkins: a.checkins,
      }));
      const firstDate = athletes.flatMap(a => [...a.sessions, ...a.checkins].filter(x => !isSynthetic(x, a.signupAt)).map(x => x.date)).sort()[0] ?? today;
      const b = computeGroupBilan({ period: periodFor(kind, anchor, firstDate), today, athletes });
      setBilan(b);
      posthog.capture("bilan_opened", { period: kind, source: "coach_group", slides: b.slides.length, slide_kinds: b.slides.map(x => x.kind).join(","), athletes: athletes.length, locked });
    })();
    return () => { alive = false; };
  }, [group, kind, anchor, today]);

  useEffect(() => {
    if (group) return;
    let alive = true;
    (async () => {
      let raw: BilanRaw;
      try { raw = await loadBilanRaw({ userId, today, athleteId: subject?.athleteId }); }
      catch (e) { if (alive) { console.error("[bilan] lecture", e instanceof Error ? e.message : e); setFailed(true); } return; }
      if (!alive) return;
      const p = { data: raw.profile }, s = { data: raw.sessions }, w = { data: raw.checkins }, t = { data: raw.tests };
      setSport(p.data?.sport ?? null);
      const signupAt = (p.data?.created_at as string | undefined) ?? new Date().toISOString();
      const checkins = (w.data ?? []) as BilanCheckin[];
      const sessions = (s.data ?? []) as BilanSession[];
      const firstDate = [...sessions, ...checkins].filter(x => !isSynthetic(x, signupAt)).map(x => x.date).sort()[0] ?? today;
      const tests: BilanTest[] = ((t.data ?? []) as { date: string; value: number; unit: string; tests: { name: string } | { name: string }[] | null }[])
        .map(r => ({ date: r.date, value: Number(r.value), unit: r.unit, name: (Array.isArray(r.tests) ? r.tests[0]?.name : r.tests?.name) ?? "" }))
        .filter(r => r.name);
      const period = periodFor(kind, anchor, firstDate);
      const b = computeBilan({ period, today, signupAt, sessions, checkins, tests, upcoming: raw.upcoming, currentShift: p.data?.autoreg_shift ?? 0, currentShiftHigh: p.data?.autoreg_shift_high ?? 0, recalEvents: p.data?.autoreg_recal_events ?? [] });
      // Le coach ne partage pas la carte du sportif à sa place ; un gratuit ne partage pas des chiffres floutés.
      if (subject || locked) b.slides = b.slides.filter(x => x.kind !== "partage");
      /* Premier bilan (2026-11-03) : tant qu'aucun écran « appris » n'a assez de données, des écrans
         d'exemple choisis par son dernier point forme, après Régularité. Côté sportif seulement. */
      const lastCheckin = [...checkins].filter(c => !isSynthetic(c, signupAt)).sort((x, y) => y.date.localeCompare(x.date))[0];
      if (!subject && lastCheckin && !b.slides.some(x => LEARNED.has(x.kind))) {
        const pre = previewSlides(lastCheckin, p.data?.sport ?? "").map((c): BilanSlide => ({ kind: "apercu", inner: c.slide, says: c.says, chip: c.chip }));
        const at = b.slides.findIndex(x => x.kind === "regularite") + 1;
        b.slides.splice(at, 0, ...pre);
      }
      setBilan(b);
      posthog.capture("bilan_opened", { period: kind, source, slides: b.slides.length, slide_kinds: b.slides.map(x => x.kind).join(","), locked });
    })();
    return () => { alive = false; };
  }, [userId, kind, anchor, today, source, subject, group, locked]);

  const slides = useMemo<AnySlide[]>(() => bilan?.slides ?? [], [bilan]);
  const slide = slides[idx];

  useEffect(() => {
    if (slide) posthog.capture("bilan_slide_viewed", { period: kind, slide: slide.kind, index: idx });
  }, [slide, idx, kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Bilan d'un sportif ouvert par-dessus : c'est lui qui écoute le clavier.
      if (drill) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx(i => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, close, drill]);

  async function share() {
    if (!bilan || !slide || slide.kind !== "partage") return;
    const text = [`Mon bilan ThePerfClub · ${bilan.title}`, ...slide.kpis.map(k => `${k.value} ${k.label}`), slide.line ?? "", "https://theperfclub.com"].filter(Boolean).join("\n");
    posthog.capture("bilan_shared", { period: kind });
    try {
      if (navigator.share) { await navigator.share({ title: "Mon bilan ThePerfClub", text }); return; }
    } catch { /* partage annulé : on retombe sur la copie */ }
    try { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 1600); } catch (e) { console.error("[bilan] copie", e); }
  }

  const last = idx >= slides.length - 1;
  const photo = slide ? photoFor(slide) : null;
  const unlock = () => { close(); onUnlock?.(); };
  const slideNode = !bilan || !slide ? null : slide.kind.startsWith("g_")
    ? <GroupSlideBody s={slide as GroupSlide} open={(id, name) => { posthog.capture("coach_bilan_opened", { from: "group_bilan", period: kind, slide: slide.kind }); setDrill({ athleteId: id, name }); }} />
    : <SlideBody s={slide as BilanSlide} bilan={bilan as Bilan} onShare={share} shared={shared} recal={recal} n={n}
        onPlanning={n || group ? undefined : () => { posthog.capture("bilan_planning_opened", { period: kind }); close(); router.push("/week"); }} />;
  const content = (
    <div
      className={exitClass}
      role="dialog" aria-modal="true" aria-label={group ? "Bilan du groupe" : n ? `Bilan de ${n}` : "Ton bilan"}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
        if (dx < -50) setIdx(i => Math.min(i + 1, slides.length - 1)); else if (dx > 50) setIdx(i => Math.max(i - 1, 0));
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483100, background: "#070a0d",
        backgroundImage: slide && !photo ? `radial-gradient(ellipse 110% 50% at 50% -8%, ${GLOW[slide.kind]} 0%, transparent 65%)` : undefined,
        color: "#fff", fontFamily: "var(--font-dm-sans), 'Helvetica Neue', sans-serif", display: "flex", justifyContent: "center",
      }}
    >
      {photo && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 560, height: "min(48vh, 420px)" }}><PhotoBanner photo={photo} height="100%" period={kind} sportPhoto={slide ? sportPhotoFor(slide, sport) : null} /></div>}
      <div style={{ position: "relative", width: "100%", maxWidth: 440, boxSizing: "border-box", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "#fff" : "rgba(255,255,255,0.22)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>
          <span>{(() => { const who = group ? "BILAN DU GROUPE" : n ? `BILAN DE ${n.toUpperCase()}` : "TON BILAN"; return bilan && slide ? `${who} · ${n ? KICKER_COACH[slide.kind as BilanSlide["kind"]] ?? KICKER[slide.kind] : KICKER[slide.kind]}` : who; })()}</span>
          <button onClick={close} aria-label="Fermer le bilan" style={{ background: "none", border: 0, color: "#fff", fontSize: 26, lineHeight: 1, cursor: "pointer", padding: 4 }}>×</button>
        </div>
        {bilan && slide && LEARNED.has(slide.kind as BilanSlide["kind"]) && bilan.period.kind !== "all" && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: -8 }}>Appris sur tout {n ? "son" : "ton"} historique</div>}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingTop: 12 }}>
          {!bilan && !failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{group ? "On rassemble les données du groupe…" : n ? "On rassemble ses données…" : "On rassemble tes données…"}</div>}
          {failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{group ? "Impossible de charger le bilan du groupe." : n ? `Impossible de charger le bilan de ${n}.` : "Impossible de charger ton bilan."} Réessaie dans un instant.</div>}
          {bilan && !slides.length && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{group ? "Pas encore assez de données pour ce bilan. Il se construit tout seul quand tes sportifs remplissent leur point forme et notent leurs séances." : n ? `Pas encore assez de données pour ce bilan. Il se construit tout seul quand ${n} remplit son point forme et note ses séances.` : "Pas encore assez de données pour ce bilan. Remplis ton point forme et note tes séances quelques jours : il se construit tout seul."}</div>}
          {/* Hauteur en vh (2026-11-04, Gildas : « sur desktop il faut trop scroller ») : 112 px sur un téléphone, moins sur une fenêtre basse. */}
          {photo && slide && <div aria-hidden="true" style={{ flex: "0 0 auto", height: "clamp(0px, calc(28vh - 120px), 112px)" }} />}
          {slide && slideNode && (locked && !OPEN_SLIDES.has(slide.kind) ? lockSlide(slideNode, `bilan_${slide.kind}`, !!n || group, unlock) : slideNode)}
        </div>

        {slides.length > 0 && (
          <div style={{ flexShrink: 0, display: "flex", gap: 10 }}>
            {idx > 0 && <button onClick={() => setIdx(i => i - 1)} style={{ flex: 1, height: 52, borderRadius: 14, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Précédent</button>}
            <button onClick={() => last ? close() : setIdx(i => i + 1)} style={{ flex: 1.6, height: 52, borderRadius: 14, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{last ? "Fermer" : idx === 0 && !group ? (n ? "Voir ce que ses données ont appris" : "Voir ce que tes données ont appris") : "Suivant"}</button>
          </div>
        )}
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return (<>
    {createPortal(content, document.body)}
    {drill && <BilanCarousel userId={drill.athleteId} kind={kind} anchor={anchor} today={today} source="coach" subject={drill} locked={locked} onUnlock={() => { setDrill(null); unlock(); }} onClose={() => setDrill(null)} />}
  </>);
}
