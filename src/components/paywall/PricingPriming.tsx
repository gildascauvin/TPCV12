"use client";

import { PRICING } from "./PaywallModal";
import type { Billing } from "./PaywallModal";
import { INTERVIEWS } from "./interviews";
import ShareButton from "@/components/sessions/ShareButton";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { isAndroidApp } from "@/lib/native";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getStoreProducts, PRODUCT_IDS, trialDays } from "@/lib/nativePurchases";
import { exitOfferAccepted, exitPrice, euros } from "@/lib/exitOffer";

/* Offre Gratuit / Elite (2026-10-07, POC https://claude.ai/artifact/MgsQY4Fncy8XtVgmNBA9Q5).
   Partagé par PrimingJourneyModal.tsx (carte Gratuit retirée le 2026-10-30 : la carte Elite seule,
   face à la frise des 14 jours offerts) — un seul point de vérité pour le prix, les fonctionnalités, les vidéos et la
   FAQ. Le titre personnalisé vit dans src/lib/primingSource.ts.

   Essai : 14 jours, CB requise, 0€ aujourd'hui. Consigne de Gildas : ne jamais parler d'« essai
   gratuit » ni d'un rappel avant facturation, seulement « 14 jours offerts » et l'annulation en
   1 clic. */
export const TRIAL_DAYS = 14;

/* Test : `?pwios=1` dans l'URL simule l'affichage de l'app iOS sur le web (montant facturé en gros, feuille de
   perte au lieu de l'offre de sortie) ; `?pwios=0` l'enlève. Mémorisé pour la session (survit aux navigations). */
export function paywallSimIos(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = new URLSearchParams(window.location.search).get("pwios");
    if (v !== null) sessionStorage.setItem("tpc_pwios", v);
    return sessionStorage.getItem("tpc_pwios") === "1";
  } catch { return false; }
}

export const PRICING_PRIMING_GUARANTEE_CAPTION = "✓ Annulation en 1 clic, sans engagement.";

type ValueStep = { verb: string; when: string; text: string };

/* Frise de la valeur façon Levels (31/10, Gildas) : verbe, échéance, ce qu'il obtient. Le paiement est dans
   RiskTimeline, la carte ne parle que de valeur. */
export function valueSteps(role: "athlete" | "coach", noAthletes?: boolean): ValueStep[] {
  return role === "athlete" ? [
    { verb: "Ajuste", when: "Dès demain", text: "Ta séance s'ajuste au bon cran chaque matin. Les bons jours tu pousses, les autres tu allèges, sans culpabiliser." },
    { verb: "Comprends", when: "Jour 7", text: "Ton premier bilan : ce qui fait vraiment bouger ta forme. Soirée, sommeil, stress : chez toi, pas en moyenne." },
    { verb: "Anticipe", when: "Semaine 3+", text: "ThePerfClub connaît tes signaux. Tu sais quels jours pousser, et tu vois venir la baisse avant la séance ratée." },
  ] : [
    noAthletes
      ? { verb: "Ajuste", when: "Dès demain", text: "Invite tes sportifs ce soir : dès demain matin, tu pousses ceux qui peuvent et tu protèges les autres, avant la séance." }
      : { verb: "Ajuste", when: "Demain matin", text: "Une décision par sportif chaque matin. Tu pousses ceux qui peuvent, tu protèges les autres, avant la séance." },
    { verb: "Comprends", when: "Jour 7", text: "Le bilan de ton groupe : qui décroche, qui force, les séances que tu écris trop légères." },
    { verb: "Anticipe", when: "Semaine 3+", text: "Tu vois venir la baisse de chaque sportif avant la blessure ou la stagnation." },
  ];
}

const mono = "var(--font-mono), monospace";

function ValuePath({ steps, hitIndex, hitLabel }: { steps: ValueStep[]; hitIndex?: number; hitLabel?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {steps.map((s, i) => {
        const hit = i === hitIndex;
        return (
          <div key={s.verb} style={{
            display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, position: "relative",
            padding: hit ? "10px 10px 12px" : "4px 0 14px", margin: hit ? "0 -10px 6px" : 0,
            background: hit ? "rgba(255,138,85,.08)" : "transparent", borderRadius: hit ? 12 : 0,
          }}>
            {i < steps.length - 1 && !hit && <span style={{ position: "absolute", left: 12, top: 32, bottom: 2, width: 2, background: "rgba(255,138,85,.22)" }} />}
            <span style={{
              width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", zIndex: 1,
              fontFamily: mono, fontSize: 12, fontWeight: 700, color: hit ? "#fff" : "#ffb08a",
              background: hit ? "#f04a08" : "rgba(212,64,0,.16)", border: hit ? "none" : "1.5px solid rgba(255,138,85,.55)",
            }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700, color: "#fff" }}>{s.verb}</span>
                <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>{s.when}</span>
                {hit && hitLabel && (
                  <span style={{ alignSelf: "center", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: "#D44000", borderRadius: 999, padding: "4px 7px" }}>{hitLabel}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.62)", lineHeight: 1.45, marginTop: 3 }}>{s.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Formules l'une sous l'autre (2026-10-30), partagées par le paywall et l'offre de sortie (ExitOffer). */
export type OfferRow = { b: Billing; label: string; big: string; unit: string; small: React.ReactNode; badge?: string; tag?: string };
export function OfferRows({ rows, billing, setBilling }: { rows: OfferRow[]; billing: Billing; setBilling: (b: Billing) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="radiogroup" aria-label="Formule">
      {rows.map(r => {
        const on = billing === r.b;
        return (
          <button key={r.b} type="button" role="radio" aria-checked={on} onClick={() => setBilling(r.b)} style={{
            position: "relative", display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
            padding: "13px 14px", borderRadius: 16, color: "#fff",
            background: on ? "rgba(212,64,0,.16)" : "rgba(255,255,255,.04)",
            border: on ? "1.5px solid #ff8a55" : "1.5px solid rgba(255,255,255,.12)",
            transition: "background .15s, border-color .15s",
          }}>
            {r.tag && <span style={{ position: "absolute", top: 0, right: 14, transform: "translateY(-50%)", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: "#D44000", borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>{r.tag}</span>}
            <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", border: on ? "6px solid #ff8a55" : "2px solid rgba(255,255,255,.35)", transition: "border .15s" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px 8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 800 }}>{r.label}</span>
                {r.badge && <span style={{ whiteSpace: "nowrap", fontFamily: mono, fontSize: 9.5, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "rgba(47,158,68,.22)", color: "#7fdb8f" }}>{r.badge}</span>}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.58)", marginTop: 3 }}>{r.small}</span>
            </span>
            <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
              {r.big}<span style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginLeft: 2 }}>{r.unit}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Paywall v2 (2026-10-30, remplace le toggle Annuel / Mensuel) : les deux formules l'une sous l'autre (l'annuel ne
   paraît une affaire qu'à côté du mensuel), annuel présélectionné, puis une ligne d'ancrage (validée par Gildas).
   App iOS (refus App Store 3.1.2(c), 2026-10-09) : le montant facturé doit être l'élément de prix le plus visible,
   donc « 78 €/an » en gros et l'équivalent mensuel en petit. */
/* Prix du store dans les apps (31/10) : le gros prix venait de PRICING alors que la mention légale affiche
   celui d'Apple / Google (écart visible, risque de refus 3.1.2). Même cache que NativePurchasePanel. */
type StorePrices = { annual: number; monthly: number; currency: string; annualStr: string; monthlyStr: string; trial: number | null };
function useStorePrices(role: "athlete" | "coach"): StorePrices | null {
  const [sp, setSp] = useState<StorePrices | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) return;
        const products = await getStoreProducts(user.id);
        const a = products[PRODUCT_IDS[role].annual], m = products[PRODUCT_IDS[role].monthly];
        if (alive && a && m) setSp({ annual: a.price, monthly: m.price, currency: a.currencyCode, annualStr: a.priceString, monthlyStr: m.priceString, trial: trialDays(a) ?? null });
      } catch (e) { console.error("[priming] prix store", e); }
    })();
    return () => { alive = false; };
  }, [role]);
  return sp;
}

/* Ancrage coach (31/10, Gildas : « cale sur la réponse ») : nombre de sportifs annoncé à l'inscription
   (ob_count) ou, dans l'app, ses vrais sportifs s'il en a au moins 5 ; sinon 10. */
function ElitePrice({ role, billing, setBilling, athleteCount }: { role: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; athleteCount?: number }) {
  const p = PRICING[role];
  const native = isNativeApp();
  const ios = native || paywallSimIos();
  const sp = useStorePrices(role);
  const fr = (n: number) => n.toFixed(2).replace(".", ",").replace(",00", "");
  /* Montants calculés (mensuel équivalent, économie, prix par sportif) écrits avec la devise et la forme du
     prix du store lui-même (31/10 : le code devise renvoyé ne correspondait pas toujours, « $ » à l'écran
     et « € » dans la feuille Apple). */
  const money = (n: number) => {
    if (!sp) return `${fr(n)} €`;
    const num = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    return sp.annualStr.replace(/\d[\d\s\u00a0\u202f.,]*\d|\d/, num);
  };
  // Offre de sortie acceptée puis « Retour aux offres » : les prix remisés, ceux que le formulaire appliquera.
  const promo = !native && exitOfferAccepted();
  const pa = exitPrice(role, "annual"), pm = exitPrice(role, "monthly");
  const pending = native && !sp;
  const annual = sp?.annual ?? p.annual, monthly = sp?.monthly ?? p.monthly;
  const saved = Math.round((monthly * 12 - annual) * 100) / 100;
  const rows: OfferRow[] = promo ? [
    { b: "annual", label: "Annuel", badge: "-30 %", tag: "Meilleur prix", big: ios ? euros(pa.now) : euros(pa.perMonth), unit: ios ? "/an" : "/mois",
      small: <><s style={{ opacity: .6 }}>{euros(pa.was)}</s> {ios ? "la 1re année" : `${euros(pa.now)} la 1re année`}</> },
    { b: "monthly", label: "Mensuel", badge: "-30 %", big: euros(pm.now), unit: "/mois", small: <><s style={{ opacity: .6 }}>{euros(pm.was)}</s> pendant 12 mois</> },
  ] : [
    {
      b: "annual", label: "Annuel", badge: pending ? undefined : `-${money(saved)}`, tag: "Meilleur prix",
      big: pending ? "…" : ios ? (sp ? sp.annualStr : `${p.annual} €`) : `${fr(p.annualMonthly)} €`, unit: ios ? "/an" : "/mois",
      small: pending ? " " : ios ? <>soit {money(annual / 12)}/mois</> : <><s style={{ opacity: .6 }}>{p.monthly * 12} €</s> {p.annual} € par an</>,
    },
    { b: "monthly", label: "Mensuel", big: pending ? "…" : sp ? sp.monthlyStr : `${p.monthly} €`, unit: "/mois", small: "Sans engagement" },
  ];
  const n = athleteCount && athleteCount > 1 ? athleteCount : 10;
  const anchor = role === "athlete"
    ? <>Le prix d&apos;<b style={{ color: "#fff" }}>une seule séance</b> avec un préparateur physique, pour toute l&apos;année.</>
    : <>Avec {n} sportifs : <b style={{ color: "#fff" }}>{money((promo ? pa.perMonth : sp ? annual / 12 : p.annualMonthly) / n)} par sportif</b> et par mois. Sportifs illimités.</>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <OfferRows rows={rows} billing={billing} setBilling={setBilling} />
      {promo && <div style={{ fontSize: 12.5, color: "#7fdb8f", fontWeight: 700 }}>Code DEPART30 appliqué.</div>}
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.62)", lineHeight: 1.5, marginTop: 4 }}>{anchor}</div>
    </div>
  );
}

/* Lien secondaire sous le CTA Elite : démo (coach) ou coach qui paie (sportif). */
export function PricingSideLink({ role, athleteSelfId, name }: { role: "athlete" | "coach"; athleteSelfId?: string; name?: string }) {
  const style: React.CSSProperties = { textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.72)" };
  if (role === "coach") {
    return (
      <div style={style}>
        Une question ? →{" "}
        <a href="https://calendly.com/cauvingildas/30min" target="_blank" rel="noopener noreferrer" style={{ color: "#ff8a55", fontWeight: 800, textDecoration: "underline" }}>Demander une démo</a>
      </div>
    );
  }
  if (!athleteSelfId) return null;
  return (
    <div style={style}>
      Gratuit avec un coach →{" "}
      <ShareButton
        linkLabel="Inviter mon coach"
        title="Hey coach, ThePerfClub m'aide à structurer mon entraînement — rejoins-moi pour me coacher dessus !"
        variant="dark"
        getShareUrl={async () => `${window.location.origin}/register?role=coach&athleteId=${encodeURIComponent(athleteSelfId)}&athleteName=${encodeURIComponent(name ?? "")}`}
      />
    </div>
  );
}

/* Carte Elite, mise en avant. `cta` = bouton d'achat (absent en mobile : bas fixe). */
export function ElitePlanCard({ role, billing, setBilling, noAthletes, hitIndex, hitLabel, cta, sideLink, athleteCount }: {
  role: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; noAthletes?: boolean;
  hitIndex: number; hitLabel?: string; cta?: React.ReactNode; sideLink?: React.ReactNode; athleteCount?: number;
}) {
  return (
    <div style={{
      borderRadius: 20, padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
      background: "linear-gradient(180deg, rgba(212,64,0,.16), rgba(212,64,0,.04) 45%, rgba(255,255,255,.03))",
      border: "1px solid rgba(255,138,85,.45)", boxShadow: "0 0 0 1px rgba(212,64,0,.18), 0 24px 60px rgba(212,64,0,.14)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#ff8a55" }}>Essayer Elite {TRIAL_DAYS} jours</span>
      </div>
      <ElitePrice role={role} billing={billing} setBilling={setBilling} athleteCount={athleteCount} />
      <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(255,138,85,.85)", margin: "4px 0 -6px" }}>En plus du gratuit</div>
      <ValuePath steps={valueSteps(role, noAthletes)} hitIndex={hitIndex} hitLabel={hitLabel} />
      {cta && <><div style={{ flex: 1 }} />{cta}</>}
      {sideLink}
    </div>
  );
}

function faqItems(role: "athlete" | "coach") {
  const cancelWhere = !isNativeApp() ? "en un clic depuis ton profil"
    : isAndroidApp() ? "depuis tes abonnements Google Play" : "depuis tes abonnements App Store";
  return [
    // Dans les apps, la résiliation passe par l'App Store ou Google Play (31/10).
    { q: "Vais-je être facturé automatiquement à la fin des 14 jours offerts ?", a: `Oui, sauf annulation avant la fin des 14 jours, ${cancelWhere}, sans engagement.` },
    { q: "Puis-je annuler à tout moment ?", a: `Oui, ${cancelWhere}, sans justification ni délai de préavis.` },
    { q: "Je garde quoi si je reste en Gratuit ?", a: "Tout ce que tu as saisi : programmes, séances, forme et mesures. Seules les décisions et les analyses sont réservées à Elite." },
    role === "coach"
      ? { q: "Puis-je ajouter autant de sportifs que je veux ?", a: "Oui, sans surcoût, quel que soit le nombre de sportifs que tu coaches." }
      : { q: "Le programme est-il vraiment personnalisé ?", a: "Oui : il est généré selon ton sport, ton niveau et ton objectif, puis ajusté selon ta récupération." },
  ];
}

const sectionLabel: React.CSSProperties = { fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 10 };

/* Sous les offres : vidéos puis FAQ, sur une seule colonne (desktop comme mobile). */
export function PrimingExtras({ role }: { role: "athlete" | "coach" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ minWidth: 0 }}>
        <div style={sectionLabel}>Les experts en parlent</div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {INTERVIEWS.filter(v => v.personas.includes(role)).map(v => (
            <div key={v.slug} style={{ flex: "0 0 220px", background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#111" }}>
                <img src={`/testimonials/${v.slug}.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />

              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#fff" }}>{v.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", marginTop: 2, lineHeight: 1.35 }}>{v.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={sectionLabel}>Questions fréquentes</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {faqItems(role).map(item => (
            <details key={item.q} style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12 }}>
              <summary style={{ fontFamily: "var(--font-display)", padding: "13px 16px", fontSize: 13.5, fontWeight: 700, color: "#fff", cursor: "pointer", listStyle: "revert" }}>{item.q}</summary>
              <div style={{ padding: "0 16px 13px", fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
