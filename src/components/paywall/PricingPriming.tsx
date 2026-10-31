"use client";

import { PRICING } from "./PaywallModal";
import type { Billing } from "./PaywallModal";
import { INTERVIEWS } from "./interviews";
import ShareButton from "@/components/sessions/ShareButton";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
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

type Feature = { title: string; text: string };

/* Mesures gratuites, décisions payantes (freemium v2). `de` = « de trail », « d'Hyrox »… ou "". */
export function planFeatures(role: "athlete" | "coach", sportDe: string | null): { free: Feature[]; elite: Feature[] } {
  const de = sportDe ? ` ${sportDe}` : "";
  return role === "athlete" ? {
    free: [
      { title: "Construis ton entraînement", text: `Un programme${de} sur mesure, importé, ou un modèle.` },
      { title: "Renseigne ta forme", text: "Ton ressenti en 10 secondes, ta montre synchronisée." },
      { title: "Fais tes séances", text: "Chrono, charges, difficulté ressentie." },
    ],
    elite: [
      { title: "Ajuste chaque séance à ta forme", text: "Alléger, maintenir ou pousser, pour plus de progrès et moins de blessures." },
      { title: "Comprends ce qui fait bouger ta forme", text: "Récupération, charge et comportements, expliqués." },
      { title: "Sache où tu en es, test par test", text: `Chaque test${de} situé par rapport à sa cible : tes forces, tes faiblesses, quoi travailler en priorité.` },
    ],
  } : {
    free: [
      { title: "Programme tes sportifs", text: `Sur mesure, importé ou modèle${de}, assigné en un geste.` },
      { title: "Invite-les", text: "Ils renseignent leur forme et leurs séances." },
      { title: "Suis leurs points forme", text: "Les scores de chacun, sans relance." },
    ],
    elite: [
      { title: "Sais chaque matin qui alléger, et de combien", text: "Une décision par sportif, sur sa forme et sa charge." },
      { title: "Comprends pourquoi un sportif décroche", text: "Avant qu'il se blesse ou stagne." },
      { title: "Repère la priorité de chaque sportif", text: "Ses tests situés par rapport à leur cible : forces et faiblesses, sportif par sportif." },
    ],
  };
}

const mono = "var(--font-mono), monospace";

function FeatureList({ items, elite, hitIndex, hitLabel }: { items: Feature[]; elite: boolean; hitIndex?: number; hitLabel?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((f, i) => {
        const hit = elite && i === hitIndex;
        return (
          <div key={f.title} style={{
            display: "grid", gridTemplateColumns: "20px 1fr", gap: 10,
            padding: hit ? "9px 10px" : "8px 0", margin: hit ? "2px -10px" : 0,
            borderTop: i === 0 || hit || (elite && i - 1 === hitIndex) ? "1px solid transparent" : "1px solid rgba(255,255,255,.06)",
            background: hit ? "rgba(255,138,85,.08)" : "transparent", borderRadius: hit ? 12 : 0,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", marginTop: 1, fontSize: 11,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: elite ? "rgba(212,64,0,.28)" : "rgba(255,255,255,.10)",
              color: elite ? "#ffb08a" : "rgba(255,255,255,.7)",
            }}>{elite ? "★" : "✓"}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: elite ? "#fff" : "rgba(255,255,255,.82)" }}>
                {f.title}
                {hit && hitLabel && (
                  <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: "#D44000", borderRadius: 999, padding: "4px 7px" }}>{hitLabel}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.58)", lineHeight: 1.45, marginTop: 2 }}>{f.text}</div>
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
  const money = (n: number) => sp ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: sp.currency }).format(n) : `${fr(n)} €`;
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
  const days = sp?.trial ?? TRIAL_DAYS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <OfferRows rows={rows} billing={billing} setBilling={setBilling} />
      {promo && <div style={{ fontSize: 12.5, color: "#7fdb8f", fontWeight: 700 }}>Code DEPART30 appliqué.</div>}
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.62)", lineHeight: 1.5, marginTop: 4 }}>{anchor}</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>0 € aujourd&apos;hui, 1er prélèvement après tes {days} jours offerts.</div>
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
export function ElitePlanCard({ role, billing, setBilling, sportDe, hitIndex, hitLabel, cta, sideLink, athleteCount }: {
  role: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; sportDe: string | null;
  hitIndex: number; hitLabel?: string; cta?: React.ReactNode; sideLink?: React.ReactNode; athleteCount?: number;
}) {
  const f = planFeatures(role, sportDe);
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
      <FeatureList items={f.elite} elite hitIndex={hitIndex} hitLabel={hitLabel} />
      {cta && <><div style={{ flex: 1 }} />{cta}</>}
      {sideLink}
    </div>
  );
}

function faqItems(role: "athlete" | "coach") {
  return [
    { q: "Vais-je être facturé automatiquement à la fin des 14 jours offerts ?", a: "Oui, sauf annulation avant la fin des 14 jours, en un clic depuis ton profil, sans engagement." },
    { q: "Puis-je annuler à tout moment ?", a: "Oui, en un clic depuis ton profil, sans justification ni délai de préavis." },
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
                <div style={{ fontFamily: mono, position: "absolute", bottom: 8, right: 8, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.55)", padding: "3px 8px", borderRadius: 8 }}>▶ YouTube</div>
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
