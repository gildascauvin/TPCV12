"use client";

import { PRICING } from "./PaywallModal";
import type { Billing } from "./PaywallModal";
import { INTERVIEWS } from "./interviews";
import ShareButton from "@/components/sessions/ShareButton";

/* Offre Gratuit / Elite (2026-10-07, POC https://claude.ai/artifact/MgsQY4Fncy8XtVgmNBA9Q5).
   Partagé par PrimingJourneyModal.tsx (desktop : 2 colonnes côte à côte ; mobile : Elite puis
   Gratuit empilés) — un seul point de vérité pour le prix, les fonctionnalités, les vidéos et la
   FAQ. Le titre personnalisé vit dans src/lib/primingSource.ts.

   Essai : 14 jours, CB requise, 0€ aujourd'hui. Consigne de Gildas : ne jamais parler d'« essai
   gratuit » ni d'un rappel avant facturation, seulement « 14 jours offerts » et l'annulation en
   1 clic. */
export const TRIAL_DAYS = 14;

export const PRICING_PRIMING_GUARANTEE_CAPTION = "✓ Annulation en 1 clic, sans engagement.";

type Feature = { title: string; text: string };

/* Mesures gratuites, décisions payantes (freemium v2). `de` = « de trail », « d'Hyrox »… ou "". */
export function planFeatures(role: "athlete" | "coach", sportDe: string | null): { free: Feature[]; elite: Feature[] } {
  const de = sportDe ? ` ${sportDe}` : "";
  return role === "athlete" ? {
    free: [
      { title: "Construis ton entraînement", text: `Un programme${de} sur mesure, importé, ou un modèle.` },
      { title: "Renseigne ta forme", text: "Ton ressenti en 30 secondes, ta montre synchronisée." },
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
      { title: "Suis leurs check-ins", text: "Les scores de chacun, sans relance." },
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

/* Prix réel en gros, « 6,50€/mois (78€/an) » en annuel (2026-10-07, équivalent mensuel en tête à la demande de Gildas ; plus de « 0€ » en tête : à côté de la carte Gratuit, deux 0€
   effaçaient le contraste entre les offres). Le 0€ d'aujourd'hui reste dit juste en dessous. */
function ElitePrice({ role, billing, setBilling }: { role: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void }) {
  const p = PRICING[role];
  const isMonthly = billing === "monthly";
  const pct = Math.round(((p.monthly * 12 - p.annual) / (p.monthly * 12)) * 100);
  const perMonth = `${p.annualMonthly.toFixed(2).replace(".", ",").replace(",00", "")}€/mois`;
  const toggleBtn = (active: boolean): React.CSSProperties => ({
    border: "none", background: active ? "rgba(255,255,255,.92)" : "transparent", color: active ? "#0b0f13" : "rgba(255,255,255,.58)",
    fontSize: 12.5, fontWeight: 800, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: mono, fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1 }}>
        {isMonthly ? `${p.monthly}€` : perMonth.replace("/mois", "")}
        <span style={{ fontSize: 15, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>
          {isMonthly ? "/mois" : `/mois (${p.annual}€/an)`}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.58)", lineHeight: 1.5 }}>
        {isMonthly ? "Sans engagement. " : ""}0€ aujourd&apos;hui, 1er prélèvement après tes {TRIAL_DAYS} jours offerts.
      </div>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: 3 }}>
        <button type="button" onClick={() => setBilling("annual")} style={toggleBtn(!isMonthly)}>
          Annuel<span style={{ fontFamily: mono, marginLeft: 5, fontSize: 8.5, fontWeight: 700, padding: "2px 5px", borderRadius: 999, background: "rgba(47,158,68,.22)", color: "#2f9e44" }}>-{pct}%</span>
        </button>
        <button type="button" onClick={() => setBilling("monthly")} style={toggleBtn(isMonthly)}>Mensuel</button>
      </div>
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

const chip = (color: string, bg: string): React.CSSProperties => ({
  fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
  color, background: bg, borderRadius: 999, padding: "5px 9px", whiteSpace: "nowrap",
});

/* Carte Gratuit : « Ton plan actuel », sans prix. `footer` = bouton « Continuer en Gratuit »
   (desktop) ; absent en mobile (lien dans le bas fixe). */
export function FreePlanCard({ role, sportDe, footer }: { role: "athlete" | "coach"; sportDe: string | null; footer?: React.ReactNode }) {
  const f = planFeatures(role, sportDe);
  return (
    <div style={{ borderRadius: 20, padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.62)" }}>Gratuit</span>
        <span style={chip("rgba(255,255,255,.62)", "rgba(255,255,255,.08)")}>Ton plan actuel</span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.58)", lineHeight: 1.5 }}>Tout ce que tu saisis et tes mesures, sans limite de durée.</div>
      <FeatureList items={f.free} elite={false} />
      {footer && <><div style={{ flex: 1 }} />{footer}</>}
    </div>
  );
}

/* Carte Elite, mise en avant. `cta` = bouton d'achat (absent en mobile : bas fixe). */
export function ElitePlanCard({ role, billing, setBilling, sportDe, hitIndex, hitLabel, cta, sideLink }: {
  role: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; sportDe: string | null;
  hitIndex: number; hitLabel?: string; cta?: React.ReactNode; sideLink?: React.ReactNode;
}) {
  const f = planFeatures(role, sportDe);
  return (
    <div style={{
      borderRadius: 20, padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
      background: "linear-gradient(180deg, rgba(212,64,0,.16), rgba(212,64,0,.04) 45%, rgba(255,255,255,.03))",
      border: "1px solid rgba(255,138,85,.45)", boxShadow: "0 0 0 1px rgba(212,64,0,.18), 0 24px 60px rgba(212,64,0,.14)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#ff8a55" }}>Elite</span>
        <span style={chip("#7fdb8f", "rgba(47,158,68,.20)")}>✓ {TRIAL_DAYS} jours offerts</span>
      </div>
      <ElitePrice role={role} billing={billing} setBilling={setBilling} />
      <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(255,138,85,.85)", margin: "4px 0 -6px" }}>Tout Gratuit, plus</div>
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
