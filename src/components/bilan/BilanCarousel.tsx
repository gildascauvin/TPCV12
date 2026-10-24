"use client";

/* Carrousel du bilan (2026-10-23, POC canvas Qx548NQG7ZrWgwQA28DYpp) : un écran par thème, façon
   story. Les chiffres viennent de computeBilan() (src/lib/bilan.ts), qui saute tout écran sous son
   seuil de données. Plein écran, au-dessus de la bottom nav (zIndex modale). */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { computeBilan, isSynthetic, periodFor, type Bilan, type BilanCheckin, type BilanPeriodKind, type BilanSession, type BilanSlide, type BilanTest } from "@/lib/bilan";
import { loadBilanRaw, type BilanRaw } from "@/lib/bilanData";
import { outcomeRight } from "@/lib/adviceJudge";
import { requestPhysioReplay } from "@/lib/physioData";
import { VerdictStrip, StripLegend } from "@/components/bilan/VerdictStrip";

type Props = {
  userId: string;
  kind: BilanPeriodKind;
  /* Un jour de la période (n'importe lequel) ; pour « depuis le début », la date de fin. */
  anchor: string;
  today: string;
  source: "home_card" | "date_picker" | "coach";
  /* Coach (2026-10-24) : bilan d'un de ses sportifs, lu via /api/coach/bilan (RLS). */
  subject?: { athleteId: string; name: string };
  onClose: () => void;
};

const GLOW: Record<BilanSlide["kind"], string> = {
  regularite: "rgba(212,64,0,0.45)", charge: "rgba(47,158,68,0.40)", ressenti: "rgba(56,189,248,0.38)",
  predit: "rgba(212,64,0,0.40)", biais: "rgba(242,138,0,0.40)", fatigue: "rgba(168,85,247,0.38)",
  leviers: "rgba(47,158,68,0.38)", tendance: "rgba(56,189,248,0.36)", tests: "rgba(212,64,0,0.45)", conseils: "rgba(47,158,68,0.38)", suivre: "rgba(168,85,247,0.36)", partage: "rgba(56,189,248,0.20)",
};
const KICKER: Record<BilanSlide["kind"], string> = {
  regularite: "RÉGULARITÉ", charge: "CHARGE", ressenti: "RESSENTI VS MONTRE", predit: "CE QUI TE PRÉDIT",
  biais: "TES BIAIS", fatigue: "CE QUI TE FATIGUE", leviers: "TES LEVIERS", tendance: "TENDANCE", tests: "TESTS", conseils: "CONSEILS VÉRIFIÉS", suivre: "SUIVRE OU PAS", partage: "EN UNE CARTE",
};
const KICKER_COACH: Partial<Record<BilanSlide["kind"], string>> = { predit: "CE QUI LE PRÉDIT", biais: "SES BIAIS", fatigue: "CE QUI LE FATIGUE", leviers: "SES LEVIERS" };
const LEARNED = new Set<BilanSlide["kind"]>(["conseils", "ressenti", "predit", "biais", "fatigue", "suivre", "leviers"]);

const card: React.CSSProperties = { background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 10 };
const h2: React.CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.12, fontWeight: 700, color: "#fff" };
const body: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" };
const small: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.65)" };
const round = (x: number) => Math.round(x);

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

function Rows({ rows, color }: { rows: { label: string; part: number; total: number; highlight?: boolean }[]; color: string }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.78)" }}><span>{r.label}</span><b style={{ color: "#fff" }}>{r.part} sur {r.total}</b></div>
          <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: `${Math.max(3, (r.part / r.total) * 100)}%`, height: "100%", borderRadius: 6, background: r.highlight ? color : "rgba(255,255,255,0.45)" }} /></div>
        </div>
      ))}
    </>
  );
}

type Recal = { state: "idle" | "saving" | "done" | "kept" | "error"; apply: (dir: "low" | "high", shift: number) => void; keep: () => void };
/* Bilan vu par le coach (2026-10-24) : `n` = prénom du sportif, tout passe à la 3e personne. Registre
   impersonnel des deux côtés (2026-10-24 soir) : ni « je » ni « l'app ». Le recalage reste au
   sportif : le coach voit l'état. */
function SlideBody({ s, bilan, onShare, shared, recal, n }: { s: BilanSlide; bilan: Bilan; onShare: () => void; shared: boolean; recal: Recal; n?: string }) {
  const T = <A, B>(you: A, them: B): A | B => (n ? them : you);
  switch (s.kind) {
    case "conseils": {
      /* Registre impersonnel (2026-10-24) : constats sans « je » ni « l'app ». */
      const lowRate = s.low.judged ? s.low.justified / s.low.judged : null;
      const right = s.strip.filter(c => outcomeRight(c.outcome)).length;
      const seg = (a: number, b: number, t: number) => [`${(a / t) * 100}%`, `${(b / t) * 100}%`, `${((t - a - b) / t) * 100}%`];
      const r = s.recal;
      const verb = r?.dir === "high" ? "pousser" : "alléger";
      return (<>
        <h2 style={h2}>{s.low.judged >= 5 && lowRate! < 0.35
          ? T(<>Tu encaisses mieux <span style={{ color: "#7ee08f" }}>que prévu.</span></>, <>{n} encaisse mieux <span style={{ color: "#7ee08f" }}>que prévu.</span></>)
          : s.strip.length >= 5 && right / s.strip.length >= 0.7 ? <>Les conseils <span style={{ color: "#7ee08f" }}>tombent juste.</span></>
          : <>Chaque conseil, <span style={{ color: "#7ee08f" }}>vérifié.</span></>}</h2>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#fff" }}><span>Derniers conseils</span><span style={{ color: "#7ee08f" }}>{right} confirmés sur {s.strip.length}</span></div>
          <VerdictStrip cells={s.strip} onOpen={n ? undefined : id => requestPhysioReplay({ kind: "session", sessionId: id })} />
          <StripLegend />
        </div>
        <div style={card}>
          {s.none.total > 0 && <>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Les jours sans alerte</div>
            {(() => { const [n1, n2, n3] = seg(s.none.same, s.none.harder, s.none.total); return <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}><div style={{ width: n1, background: "#2f9e44" }} /><div style={{ width: n2, background: "#f28a00" }} /><div style={{ width: n3, background: "rgba(255,255,255,0.25)" }} /></div>; })()}
            <div style={small}>Séance comme prévu {s.none.same} fois sur {s.none.total}{s.none.harder ? `, plus dure ${s.none.harder} fois` : ""}.</div>
          </>}
          {s.low.judged > 0 && <>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 6 }}>Les jours d'alerte</div>
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${lowRate! * 100}%`, background: "#f28a00" }} /><div style={{ flex: 1, background: "rgba(255,255,255,0.25)" }} /></div>
            <div style={small}>Alerte confirmée {s.low.justified} fois sur {s.low.judged}.{s.low.judged - s.low.justified ? ` Les ${s.low.judged - s.low.justified} autres fois, ${T("tu avais", `${n} avait`)} de la marge.` : ""}{s.low.followed ? ` ${s.low.followed} séance${s.low.followed > 1 ? "s" : ""} allégée${s.low.followed > 1 ? "s" : ""} et bien passée${s.low.followed > 1 ? "s" : ""}, hors des comptes.` : ""}</div>
          </>}
          {s.high.judged > 0 && <>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 6 }}>Les jours où pousser était conseillé</div>
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${(s.high.right / s.high.judged) * 100}%`, background: "#4c8dff" }} /><div style={{ flex: 1, background: "rgba(255,255,255,0.25)" }} /></div>
            <div style={small}>Surcharge justifiée {s.high.right} fois sur {s.high.judged}.</div>
          </>}
        </div>
        {n && (s.currentShift > 0 || s.currentShiftHigh > 0 || r) && (
          <div style={{ ...card, gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7ee08f" }}>{s.currentShift > 0 || s.currentShiftHigh > 0 ? "Seuil recalé" : "Recalage proposé"}</div>
            <div style={{ fontSize: 15, lineHeight: 1.45, color: "#fff" }}>{s.currentShift > 0 || s.currentShiftHigh > 0
              ? `${n} a choisi de se recaler : ${[s.currentShift > 0 ? "les alertes d'allègement sont plus rares" : null, s.currentShiftHigh > 0 ? "pousser est proposé moins souvent" : null].filter(Boolean).join(", ")}.`
              : `Les conseils « ${verb} » de ${n} ont rarement été confirmés. Un seuil plus net lui est proposé. C'est ${n} qui décide.`}</div>
          </div>
        )}
        {!n && r && recal.state !== "kept" && (
          <div style={{ ...card, gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7ee08f" }}>{recal.state === "done" ? "Recalage enregistré" : "Recalage proposé"}</div>
            <div style={{ fontSize: 15, lineHeight: 1.45, color: "#fff" }}>{recal.state === "done"
              ? `Les conseils « ${verb} » seront plus rares, réservés aux signaux nets. Le bilan mesurera si c'était le bon réglage.`
              : r.dir === "high" ? "Quand pousser est conseillé, la séance reste souvent dure. Un signal plus net sera attendu avant de te le proposer." : "Une récup un peu sous ta norme pèse peu sur tes séances. Un signal plus net sera attendu avant de te conseiller d'alléger."}</div>
            {recal.state !== "done" && <div style={small}>Rejoué sur ton historique : {r.alertsThen} conseils au lieu de {r.alertsNow}, confirmés {r.justifiedThen} fois au lieu de {r.justifiedNow}.</div>}
            {recal.state === "error" && <div style={{ ...small, color: "#ffb59a" }}>Impossible d'enregistrer. Réessaie dans un instant.</div>}
            {(recal.state === "idle" || recal.state === "error" || recal.state === "saving") && (
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button onClick={recal.keep} style={{ flex: 1, height: 46, borderRadius: 12, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Garder l'ancien</button>
                <button onClick={() => recal.apply(r.dir === "high" ? "high" : "low", r.shift)} disabled={recal.state === "saving"} style={{ flex: 1.4, height: 46, borderRadius: 12, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{recal.state === "saving" ? "…" : "Me recaler"}</button>
              </div>
            )}
          </div>
        )}
      </>);
    }
    case "suivre": {
      const diff = s.followed.felt - s.ignored.felt;
      const bars = [{ label: `${T("Tu as allégé", "Allégé")} (${s.followed.n} fois)`, value: s.followed.felt, display: String(round(s.followed.felt)), highlight: true }, { label: `${T("Tu as gardé ta séance", "Séance gardée")} (${s.ignored.n} fois)`, value: s.ignored.felt, display: String(round(s.ignored.felt)) }];
      return (<>
        <h2 style={h2}>{Math.abs(diff) < 5 ? <>Alléger ou pas, <span style={{ color: "#c79bf7" }}>{T("ton", "son")} lendemain est le même.</span></> : diff > 0 ? <>{T("Quand tu allèges,", `Quand ${n} allège,`)} <span style={{ color: "#c79bf7" }}>{T("ton", "son")} lendemain est meilleur.</span></> : <>{T("Garder ta séance", "Garder sa séance")} <span style={{ color: "#c79bf7" }}>{T("ne t'a rien coûté.", `n'a rien coûté à ${n}.`)}</span></>}</h2>
        <div style={card}><div style={small}>{T("Les jours d'alerte · ta forme ressentie le lendemain", "Les jours d'alerte · sa forme ressentie le lendemain")}</div><Bars bars={bars} height={100} color="#a855f7" dim="rgba(199,155,247,0.4)" showValues /></div>
        <p style={body}>{n ? (Math.abs(diff) < 5 ? `Garder sa séance ces jours-là n'a rien coûté à ${n}.${s.shifted ? " C'est pour ça que son seuil a été relevé." : ""}` : diff > 0 ? `Suivre l'ajustement fait arriver ${n} plus frais le lendemain.` : `${n} encaisse ces séances : les alertes peuvent être plus rares.`) : Math.abs(diff) < 5 ? (s.shifted ? "Garder ta séance ces jours-là ne t'a rien coûté : c'est pour ça que ton seuil a été relevé." : "Garder ta séance ces jours-là ne t'a rien coûté. L'écran « Conseils vérifiés » propose d'en tenir compte.") : diff > 0 ? "Suivre l'ajustement te fait arriver plus frais le lendemain." : "Tu encaisses ces séances : les alertes peuvent être plus rares."}</p>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{T("Plus tard : ta progression aux tests, les semaines où tu suis et celles où tu ne suis pas.", "Plus tard : sa progression aux tests, les semaines où l'ajustement est suivi et celles où il ne l'est pas.")}</div>
      </>);
    }
    case "regularite": {
      const scope = bilan.period.kind === "week" ? "cette semaine" : bilan.period.kind === "month" ? "ce mois-ci" : "depuis le début";
      return (<>
        <h2 style={h2}>{s.sessions} séance{s.sessions > 1 ? "s" : ""}. {s.checkins} check-in{s.checkins > 1 ? "s" : ""}.{s.noGap && <><br /><span style={{ color: "#ff8a5c" }}>Zéro semaine sautée.</span></>}</h2>
        <div style={card}><div style={small}>Charge d'entraînement {bilan.period.kind === "week" ? "par jour" : "par semaine"}</div><Bars bars={s.bars} height={120} /></div>
        <p style={body}>{T("Ton", "Son")} check-in rempli {s.checkins} matin{s.checkins > 1 ? "s" : ""} sur {s.days}, {scope}.</p>
      </>);
    }
    case "charge":
      return (<>
        <h2 style={h2}>{s.pctInZone >= 70 ? T(<>Tu t'entraînes dur, <span style={{ color: "#7ee08f" }}>sans t'enterrer.</span></>, <>{n} s'entraîne dur, <span style={{ color: "#7ee08f" }}>sans s'enterrer.</span></>) : <>{T("Ta charge est sortie de ta zone", "Sa charge est sortie de sa zone")} <span style={{ color: "#ffb347" }}>{100 - s.pctInZone} % du temps.</span></>}</h2>
        <div style={{ position: "relative", width: 220, height: 220, alignSelf: "center" }}>
          <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`${s.pctInZone} % des jours dans la zone de charge`}>
            <circle cx="110" cy="110" r="88" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="20" />
            <circle cx="110" cy="110" r="88" fill="none" stroke="#2f9e44" strokeWidth="20" strokeLinecap="round" strokeDasharray={`${(s.pctInZone / 100) * 553} 553`} transform="rotate(-90 110 110)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><b style={{ fontSize: 48, lineHeight: 1, color: "#fff" }}>{s.pctInZone} %</b><span style={small}>des jours en zone</span></div>
        </div>
        <p style={body}>{T("Ta charge des 7 derniers jours est restée dans ta zone optimale", "Sa charge des 7 derniers jours est restée dans sa zone optimale")} {s.pctInZone} % du temps{s.daysHigh ? `, et ${s.daysHigh} jour${s.daysHigh > 1 ? "s" : ""} au-dessus de la zone de risque.` : ", sans jamais passer dans la zone de risque."}</p>
      </>);
    case "ressenti":
      return (<>
        <h2 style={h2}>{T("Ton", "Son")} ressenti <span style={{ color: "#8cc4f5" }}>vaut une montre.</span></h2>
        <div style={card}><div style={small}>Sommeil mesuré, selon {T("ta", "sa")} réponse au réveil</div><Bars bars={s.sleepBars} height={100} color="#6da7ec" dim="rgba(109,167,236,0.4)" showValues /></div>
        {s.crashes >= 3 && <div style={card}><div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>{s.crashesSeen === s.crashes ? `Les ${s.crashes} matins où ${T("ta", "sa")} VFC s'est effondrée, ${T("ton", "son")} check-in l'avait vu aussi.` : `Sur les ${s.crashes} matins où ${T("ta", "sa")} VFC s'est effondrée, ${T("ton", "son")} check-in l'avait vu ${s.crashesSeen} fois.`}</div></div>}
      </>);
    case "predit":
      return (<>
        <h2 style={h2}>Ce qui rend {T("tes", "ses")} séances <span style={{ color: "#ff8a5c" }}>plus dures que prévu.</span></h2>
        {s.blocks.map((b, i) => <div key={i} style={card}><div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{n ? b.title.replace(/\bton /g, "son ").replace(/\bta /g, "sa ") : b.title}</div><Rows rows={b.rows} color="#ff6a2b" /></div>)}
        <p style={{ ...body, fontSize: 14 }}>{T("Séances ressenties plus dures que ce que tu avais prévu, selon ton check-in du matin.", "Séances ressenties plus dures que prévu, selon son check-in du matin.")}</p>
      </>);
    case "biais":
      return (<>
        <h2 style={h2}>{T("Tes", "Ses")} séances prévues {s.planned}s, <span style={{ color: "#ffb347" }}>{T("tu les ressens", `${n} les ressent`)} {s.feltWord}s.</span></h2>
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
        <div style={{ display: "grid", gridTemplateColumns: s.accurate ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: 10 }}>
          <div style={{ ...card, gap: 2 }}><b style={{ fontSize: 26, color: "#ffb347" }}>{s.harder} / {s.total}</b><span style={small}>prévues {s.planned}s, ressenties plus dures</span></div>
          {s.accurate && <div style={{ ...card, gap: 2 }}><b style={{ fontSize: 26, color: "#fff" }}>{s.accurate.ok} / {s.accurate.total}</b><span style={small}>prévues {s.accurate.planned}s, ressenties comme prévu</span></div>}
        </div>
        <p style={{ ...body, fontSize: 14 }}>Conseil : {T("prévois-les", "prévoyez-les")} un cran plus haut.{s.accurate ? ` ${T("Tes", "Ses")} séances prévues ${s.accurate.planned}s, elles, tombent juste.` : ""}</p>
      </>);
    case "fatigue": {
      const bars = [
        ...(s.hard ? [{ label: "Séance normale", value: s.hard.easy, display: String(round(s.hard.easy)) }, { label: "Séance très dure", value: s.hard.hard, display: String(round(s.hard.hard)) }] : [{ label: T("Ta norme", "Sa norme"), value: s.normScore, display: String(round(s.normScore)) }]),
        { label: "Soirée", value: s.nextScore, display: String(round(s.nextScore)), highlight: true },
        ...(s.afterScore !== null ? [{ label: "2 jours après une soirée", value: s.afterScore, display: String(round(s.afterScore)) }] : []),
      ];
      const hardFree = s.hard && Math.abs(s.hard.hard - s.hard.easy) < 5;
      const back = s.afterScore !== null && s.normScore - s.afterScore < 5;
      return (<>
        <h2 style={h2}>{hardFree ? <>Une séance très dure ne {T("te", "lui")} coûte rien le lendemain. <span style={{ color: "#c79bf7" }}>Une soirée, si.</span></> : <>Une soirée (alcool ou sortie) <span style={{ color: "#c79bf7" }}>se paie le lendemain.</span></>}</h2>
        <div style={card}><div style={small}>{T("Ta", "Sa")} forme ressentie le lendemain de…, sur 100</div><Bars bars={bars} height={110} color="#a855f7" dim="rgba(199,155,247,0.35)" showValues /></div>
        <p style={body}>{s.hrv ? `Le lendemain d'une soirée (alcool ou sortie), ${T("ta", "sa")} VFC tombe de ${round(s.hrv.norm)} à ${round(s.hrv.next)} ms. ` : `Mesuré sur ${s.soirees} soirées (alcool ou sortie). `}{back ? `Le surlendemain, tout est revenu dans ${T("ta", "sa")} norme.` : ""}</p>
      </>);
    }
    case "leviers": {
      const top = s.rows[0];
      return (<>
        <h2 style={h2}>{top.positive ? <>{top.label} <span style={{ color: "#7ee08f" }}>{s.unit === "sleep" ? `${T("te", "lui")} rend ${top.delta.replace("+", "")} de nuit.` : `${T("te", "lui")} fait gagner ${top.delta.replace("+", "")} de forme.`}</span></> : <>{top.label} <span style={{ color: "#ffb347" }}>{s.unit === "sleep" ? `${T("te", "lui")} coûte ${top.delta.replace("−", "")} de nuit.` : `${T("te", "lui")} coûte ${top.delta.replace("−", "")} de forme.`}</span></>}</h2>
        <div style={card}>
          <div style={small}>{s.unit === "sleep" ? "Sommeil mesuré" : "Forme du matin"}, hors soirées (alcool ou sortie)</div>
          {s.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.85)" }}><span>{r.label}</span><b style={{ color: r.positive ? "#7ee08f" : "#fff" }}>{r.delta}</b></div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Avec : {r.with} · Sans : {r.without}</div>
            </div>
          ))}
        </div>
        <p style={{ ...body, fontSize: 14 }}>{T("Chacun a ses leviers. Garde ton énergie pour ceux qui marchent chez toi.", `Chacun a ses leviers. Ceux-là marchent chez ${n}.`)}</p>
      </>);
    }
    case "tendance": {
      const last = s.months[s.months.length - 1];
      return (<>
        <h2 style={h2}>{s.direction === "down" ? <>{T("Ta", "Sa")} forme baisse. {s.lateNights && <span style={{ color: "#8cc4f5" }}>{T("Tes", "Ses")} couchers reculent.</span>}</> : s.direction === "up" ? <>{T("Ta", "Sa")} forme <span style={{ color: "#7ee08f" }}>remonte.</span></> : <>{T("Ta", "Sa")} forme est <span style={{ color: "#8cc4f5" }}>stable.</span></>}</h2>
        <div style={card}><div style={small}>Forme moyenne par mois</div><Bars bars={s.months} height={90} color="#6da7ec" dim="rgba(109,167,236,0.45)" showValues /></div>
        {s.lateNights && <div style={card}><div style={small}>Couchers après minuit</div><Bars bars={s.lateNights} height={50} color="#f28a00" dim="rgba(109,167,236,0.45)" showValues /></div>}
        <p style={{ ...body, fontSize: 14 }}>{(() => { const peak = s.months.reduce((a, b) => (b.value > a.value ? b : a)); if (s.direction === "stable") { const vs = s.months.map(m => m.value); return `Entre ${Math.min(...vs)} et ${Math.max(...vs)} chaque mois : ${T("tu tiens ton", `${n} tient son`)} niveau.`; } return (peak !== last ? `Au plus haut en ${peak.label.replace(".", "")} (${peak.display}), ${last.display} en ${last.label.replace(".", "")}.` : `${last.display} en ${last.label.replace(".", "")}, ${T("ton", "son")} meilleur mois.`) + T(" Le signal est lent : tu ne le sens pas d'un jour à l'autre.", " Le signal est lent : il ne se sent pas d'un jour à l'autre."); })()}</p>
      </>);
    }
    case "tests": {
      const pts = s.main.points, vs = pts.map(p => p.value);
      const mn = Math.min(...vs), mx = Math.max(...vs), W = 300, H = 120;
      const xy = pts.map((p, i) => [16 + (i / Math.max(1, pts.length - 1)) * (W - 32), 20 + (1 - (p.value - mn) / (mx - mn || 1)) * (H - 40)]);
      const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
      return (<>
        <h2 style={h2}>{s.main.name} <span style={{ color: "#ff8a5c" }}>+{s.main.pct} %.</span></h2>
        <div style={card}>
          <svg width="100%" height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`${s.main.name} : ${pts.map(p => fmt(p.value)).join(", ")}`}>
            <polyline points={xy.map(p => p.join(",")).join(" ")} fill="none" stroke="#ff6a2b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {xy.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="6" fill={i === xy.length - 1 ? "#ff6a2b" : "#14181b"} stroke="#ff6a2b" strokeWidth="3" /><text x={p[0]} y={p[1] - 12} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">{fmt(pts[i].value)}</text><text x={p[0]} y={H + 18} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">{`${Number(pts[i].date.slice(8))}/${Number(pts[i].date.slice(5, 7))}`}</text></g>)}
          </svg>
        </div>
        {s.others.map((o, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px" }}><span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{o.name}</span><span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{o.from} → {o.to} <span style={{ color: "#7ee08f" }}>+{o.pct} %</span></span></div>)}
      </>);
    }
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

export default function BilanCarousel({ userId, kind, anchor, today, source, subject, onClose }: Props) {
  const n = subject?.name;
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shared, setShared] = useState(false);
  const [recalState, setRecalState] = useState<Recal["state"]>("idle");
  const recal: Recal = {
    state: recalState,
    apply: async (dir, shift) => {
      setRecalState("saving");
      const { data, error } = await createClient().from("profiles").update(dir === "high" ? { autoreg_shift_high: shift } : { autoreg_shift: shift }).eq("user_id", userId).select("user_id");
      if (error || !data?.length) { console.error("[bilan] recalage", error?.message ?? "aucune ligne"); setRecalState("error"); return; }
      posthog.capture("autoreg_recalibrated", { shift, dir, period: kind });
      setRecalState("done");
    },
    keep: () => { posthog.capture("autoreg_recalibration_declined", { period: kind }); setRecalState("kept"); },
  };
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let raw: BilanRaw;
      try { raw = await loadBilanRaw({ userId, today, athleteId: subject?.athleteId }); }
      catch (e) { if (alive) { console.error("[bilan] lecture", e instanceof Error ? e.message : e); setFailed(true); } return; }
      if (!alive) return;
      const p = { data: raw.profile }, s = { data: raw.sessions }, w = { data: raw.checkins }, t = { data: raw.tests };
      const signupAt = (p.data?.created_at as string | undefined) ?? new Date().toISOString();
      const checkins = (w.data ?? []) as BilanCheckin[];
      const sessions = (s.data ?? []) as BilanSession[];
      const firstDate = [...sessions, ...checkins].filter(x => !isSynthetic(x, signupAt)).map(x => x.date).sort()[0] ?? today;
      const tests: BilanTest[] = ((t.data ?? []) as { date: string; value: number; unit: string; tests: { name: string } | { name: string }[] | null }[])
        .map(r => ({ date: r.date, value: Number(r.value), unit: r.unit, name: (Array.isArray(r.tests) ? r.tests[0]?.name : r.tests?.name) ?? "" }))
        .filter(r => r.name);
      const period = periodFor(kind, anchor, firstDate);
      const b = computeBilan({ period, today, signupAt, sessions, checkins, tests, currentShift: p.data?.autoreg_shift ?? 0, currentShiftHigh: p.data?.autoreg_shift_high ?? 0 });
      // Le coach ne partage pas la carte du sportif à sa place.
      if (subject) b.slides = b.slides.filter(x => x.kind !== "partage");
      setBilan(b);
      posthog.capture("bilan_opened", { period: kind, source, slides: b.slides.length, slide_kinds: b.slides.map(x => x.kind).join(",") });
    })();
    return () => { alive = false; };
  }, [userId, kind, anchor, today, source, subject]);

  const slides = useMemo(() => bilan?.slides ?? [], [bilan]);
  const slide = slides[idx];

  useEffect(() => {
    if (slide) posthog.capture("bilan_slide_viewed", { period: kind, slide: slide.kind, index: idx });
  }, [slide, idx, kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx(i => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  async function share() {
    if (!bilan || slide?.kind !== "partage") return;
    const text = [`Mon bilan ThePerfClub · ${bilan.title}`, ...slide.kpis.map(k => `${k.value} ${k.label}`), slide.line ?? "", "https://theperfclub.com"].filter(Boolean).join("\n");
    posthog.capture("bilan_shared", { period: kind });
    try {
      if (navigator.share) { await navigator.share({ title: "Mon bilan ThePerfClub", text }); return; }
    } catch { /* partage annulé : on retombe sur la copie */ }
    try { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 1600); } catch (e) { console.error("[bilan] copie", e); }
  }

  const last = idx >= slides.length - 1;
  const content = (
    <div
      role="dialog" aria-modal="true" aria-label={n ? `Bilan de ${n}` : "Ton bilan"}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
        if (dx < -50) setIdx(i => Math.min(i + 1, slides.length - 1)); else if (dx > 50) setIdx(i => Math.max(i - 1, 0));
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483100, background: "#070a0d",
        backgroundImage: slide ? `radial-gradient(ellipse 110% 50% at 50% -8%, ${GLOW[slide.kind]} 0%, transparent 65%)` : undefined,
        color: "#fff", fontFamily: "var(--font-dm-sans), 'Helvetica Neue', sans-serif", display: "flex", justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, boxSizing: "border-box", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "#fff" : "rgba(255,255,255,0.22)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>
          <span>{bilan ? `${n ? `BILAN DE ${n.toUpperCase()}` : "TON BILAN"} · ${slide ? (n ? KICKER_COACH[slide.kind] ?? KICKER[slide.kind] : KICKER[slide.kind]) : ""}` : n ? `BILAN DE ${n.toUpperCase()}` : "TON BILAN"}</span>
          <button onClick={onClose} aria-label="Fermer le bilan" style={{ background: "none", border: 0, color: "#fff", fontSize: 26, lineHeight: 1, cursor: "pointer", padding: 4 }}>×</button>
        </div>
        {bilan && slide && LEARNED.has(slide.kind) && bilan.period.kind !== "all" && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: -8 }}>Appris sur tout {n ? "son" : "ton"} historique</div>}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingTop: 12 }}>
          {!bilan && !failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{n ? "On rassemble ses données…" : "On rassemble tes données…"}</div>}
          {failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{n ? `Impossible de charger le bilan de ${n}.` : "Impossible de charger ton bilan."} Réessaie dans un instant.</div>}
          {bilan && !slides.length && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>{n ? `Pas encore assez de données pour ce bilan. Il se construit tout seul quand ${n} remplit son check-in et note ses séances.` : "Pas encore assez de données pour ce bilan. Remplis ton check-in et note tes séances quelques jours : il se construit tout seul."}</div>}
          {bilan && slide && <SlideBody s={slide} bilan={bilan} onShare={share} shared={shared} recal={recal} n={n} />}
        </div>

        {slides.length > 0 && (
          <div style={{ flexShrink: 0, display: "flex", gap: 10 }}>
            {idx > 0 && <button onClick={() => setIdx(i => i - 1)} style={{ flex: 1, height: 52, borderRadius: 14, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Précédent</button>}
            <button onClick={() => last ? onClose() : setIdx(i => i + 1)} style={{ flex: 1.6, height: 52, borderRadius: 14, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{last ? "Fermer" : idx === 0 ? (n ? "Voir ce que ses données ont appris" : "Voir ce que tes données ont appris") : "Suivant"}</button>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
