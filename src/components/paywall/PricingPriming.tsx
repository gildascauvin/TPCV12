"use client";

import { PRICING, PAYWALL_AVATARS, PAYWALL_TESTIMONIALS } from "./PaywallModal";
import type { Billing } from "./PaywallModal";
import type { ProgramFocus } from "@/types";
import { PlanningPreview, WellnessCardPreview, CoachControlPreview, ChargePreview, AthleteChargePreview } from "./FrisePreviews";
import { INTERVIEWS } from "./interviews";

/* Contenu partagé entre PrimingJourneyModal.tsx (paywall in-app, gating free/expired) et l'étape
   paywall_priming de l'onboarding (OnboardingFlow.tsx) — un seul point de vérité pour le badge,
   le prix, la garantie, les bullets de valeur, la frise, le témoignage, la bande de confiance et
   la FAQ. Décision explicite de Gildas (2026-08-07) : ces deux écrans doivent être "exactement le
   même composant" pour ne plus jamais diverger sur le wording. Le shell (modal dismissible vs
   page pleine largeur) et le CTA final restent propres à chaque appelant — seul le contenu entre
   le badge et le CTA vit ici.

   Plus d'essai gratuit (retiré 2026-08-07, remplacé par une garantie remboursé 14 jours) — voir
   CLAUDE.md section correspondante pour l'historique complet de la décision. */

/* Sous le CTA "Continuer →" de l'écran priming (pas dans la carte prix elle-même — retiré de là
   le 2026-08-07 à la demande de Gildas), sur les deux surfaces (modal in-app + onboarding). */
export const PRICING_PRIMING_GUARANTEE_CAPTION = "🛡️ Remboursé sous 14 jours si besoin, sans justification.";

/* Bullet "objectif" — un par ProgramFocus réellement sélectionnable via goal_2a (GOAL_META dans
   OnboardingFlow.tsx : volume/intensite/competition/mixte). "échéance" et "équilibre" reprennent
   le vocabulaire déjà établi ailleurs dans l'app pour ces 2 focus (goalLower "préparer ton
   échéance" ; icône ⚖️ déjà utilisée pour "mixte") plutôt que les noms techniques de l'enum. Les 3
   valeurs de ProgramFocus non sélectionnables ici (technique/combat/autre, utilisées ailleurs par
   le générateur) retombent sur un libellé générique. */
const FOCUS_BULLET: Record<ProgramFocus, string> = {
  volume: "Adapté à ton objectif de volume",
  intensite: "Adapté à ton objectif d'intensité",
  competition: "Adapté à ton objectif d'échéance",
  mixte: "Adapté à ton objectif d'équilibre",
  technique: "Adapté à ton objectif d'entraînement",
  combat: "Adapté à ton objectif d'entraînement",
  autre: "Adapté à ton objectif d'entraînement",
};

const BULLETS: Record<"athlete" | "coach", string[]> = {
  athlete: [
    "Ajusté selon ta récupération",
  ],
  coach: [
    "Sportifs illimités dans ton espace coach",
    "Détection des sportifs qui nécessitent ton attention",
    "Ajustements basés sur la récupération réelle",
  ],
};

const UNLOCK_LINE: Record<"athlete" | "coach", string> = {
  athlete: "Ton programme personnalisé est déjà prêt. Débloque-le et laisse ThePerfClub ajuster chaque séance.",
  coach: "Ton système de suivi est prêt. Débloque-le et laisse ThePerfClub t'aider à prendre les bonnes décisions pour chaque sportif, à chaque séance.",
};

const FRISE_STEPS: Record<"athlete" | "coach", { title: string; period: string; text: string }[]> = {
  athlete: [
    { title: "Enregistre", period: "Semaine 1-2", text: "Enregistre tes séances et ton ressenti pendant 2 semaines. ThePerfClub identifie déjà ce qui joue sur ta récupération et ta forme." },
    { title: "Cible", period: "Semaine 3-4", text: "Cible les comportements qui pèsent le plus sur ta forme. Ta charge s'ajuste automatiquement à ta vraie récupération." },
    { title: "Progresse", period: "Mois 2+", text: "Ton profil d'autorégulation prend forme. Tu sais enfin ce qui te freine et ce qui te fait vraiment avancer." },
  ],
  coach: [
    { title: "Enregistre", period: "Semaine 1-2", text: "Enregistre les séances et le ressenti de tes sportifs pendant 2 semaines. ThePerfClub identifie déjà ce qui joue sur leur récupération." },
    { title: "Cible", period: "Semaine 3-4", text: "Cible les comportements qui pèsent le plus sur la forme de chacun. Leur charge s'ajuste automatiquement à leur vraie récupération." },
    { title: "Progresse", period: "Mois 2+", text: "Le profil d'autorégulation de chaque sportif prend forme. Tu sais enfin ce qui les freine et ce qui les fait vraiment avancer." },
  ],
};

function faqItems(role: "athlete" | "coach") {
  return [
    { q: "Puis-je être remboursé si ça ne me convient pas ?", a: "Oui, sous 14 jours après ton paiement, sans justification. Écris-nous à contact@theperfclub.com." },
    { q: "Puis-je annuler à tout moment ?", a: "Oui, en un clic depuis ton profil, sans justification ni délai de préavis." },
    { q: "Puis-je changer de formule après ?", a: "Oui, tu peux basculer entre mensuel et annuel à tout moment depuis ton profil." },
    role === "coach"
      ? { q: "Puis-je ajouter autant de sportifs que je veux ?", a: "Oui, sans surcoût, quel que soit le nombre de sportifs que tu coaches." }
      : { q: "Le programme est-il vraiment personnalisé ?", a: "Oui : il est généré selon ton sport, ton niveau et ton objectif, puis ajusté automatiquement selon ton wellness." },
  ];
}

/* Labels du CTA final (soumission Stripe, écran suivant celui-ci) — vivent dans PaywallModal.tsx
   avec PRICING (import direct depuis là, pas de ré-export ici, pour éviter tout import circulaire
   entre les deux fichiers). */

export interface PricingPrimingProps {
  role: "athlete" | "coach";
  billing: Billing;
  setBilling: (b: Billing) => void;
  /** Titre affiché en tête — calculé par l'appelant (générique par rôle, ou "Ton programme {nom} t'attend" si programme claimé). */
  headline: string;
  /** Ligne secondaire optionnelle sous le titre (ex. programme claimé). */
  sub?: string | null;
  /** Sport réel de l'utilisateur, pour le titre de la frise ("Ton programme {Sport} devient plus intelligent..."). Repli générique si absent. */
  sport?: string;
  /** Nombre réel de séances du programme généré (weeks × jours d'entraînement) — absent en gating in-app (pas de génération en cours), un bullet non chiffré prend le relais. */
  sessionCount?: number;
  /** Objectif de bloc réel (GOAL_TO_FOCUS[goal]) — absent en gating in-app (pas de choix fait à cet instant), bullet générique en repli. */
  focus?: ProgramFocus;
  /** Prénom réel de l'utilisateur — utilisé dans les illustrations de la frise (sportif démo côté
      coach) pour rester personnel. Repli "Toi" si absent, même convention que coachFirstName dans
      WeekPreviewStep.tsx. */
  name?: string;
}

export function PricingPrimingContent({ role, billing, setBilling, headline, sub, sport, sessionCount, focus, name }: PricingPrimingProps) {
  const p = PRICING[role];
  const isMonthly = billing === "monthly";
  const annualSavings = p.monthly * 12 - p.annual;
  const annualSavingsPct = Math.round((annualSavings / (p.monthly * 12)) * 100);
  const testimonial = PAYWALL_TESTIMONIALS[role];

  const bullets = role === "athlete"
    ? [
        sessionCount ? `${sessionCount} séances générées` : "Ton programme sur mesure, déjà généré",
        focus ? FOCUS_BULLET[focus] : "Adapté à ton objectif d'entraînement",
        ...BULLETS.athlete,
      ]
    : BULLETS.coach;

  const friseTitle = sport
    ? (role === "coach" ? `Le programme ${sport} de tes sportifs devient plus intelligent à chaque semaine.` : `Ton programme ${sport} devient plus intelligent à chaque semaine.`)
    : (role === "coach" ? "Le programme de tes sportifs devient plus intelligent à chaque semaine." : "Ton programme devient plus intelligent à chaque semaine.");

  return (
    <div>
      <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10, lineHeight: 1.2 }}>{headline}</div>
      {sub && <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>{sub}</div>}

      <div style={{
        position: "relative", overflow: "hidden",
        background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
        border: "1px solid rgba(255,255,255,.13)", borderRadius: 16, padding: "18px 18px 16px",
        marginBottom: 22, marginTop: sub ? 0 : 18, boxShadow: "0 20px 48px rgba(0,0,0,.22)",
      }}>
        <div style={{ position: "absolute", top: 16, right: 16, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "#7fdb8f", background: "rgba(47,158,68,.20)", padding: "5px 10px", borderRadius: 999 }}>
          ✓ Garanti 14j
        </div>
        <div style={{ fontSize: 42, fontWeight: 1000, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1, marginTop: 24 }}>
          {isMonthly ? `${p.monthly}€` : `${p.annualMonthly.toFixed(2).replace(".", ",")}€`}<span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>/mois</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginTop: 9, lineHeight: 1.5 }}>
          {isMonthly ? `Facturé chaque mois, soit ${(p.monthly / 30).toFixed(2).replace(".", ",")}€/jour.` : `Facturé ${p.annual}€/an. Tu économises ${annualSavingsPct}%.`}
        </div>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: 3, marginTop: 12 }}>
          <button type="button" onClick={() => setBilling("annual")} style={{ border: "none", background: !isMonthly ? "#d44000" : "transparent", color: !isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>
            Annuel<span style={{ marginLeft: 5, fontSize: 8, fontWeight: 900, padding: "2px 5px", borderRadius: 999, background: "rgba(47,158,68,.18)", color: "#2f9e44" }}>-{annualSavingsPct}%</span>
          </button>
          <button type="button" onClick={() => setBilling("monthly")} style={{ border: "none", background: isMonthly ? "#d44000" : "transparent", color: isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>Mensuel</button>
        </div>

        <ul style={{ margin: "16px 0 4px", padding: 0, listStyle: "none" }}>
          {bullets.map((b) => (
            <li key={b} style={{ display: "flex", gap: 8, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.82)", lineHeight: 1.5, marginBottom: 6 }}>
              <span style={{ color: "#7fdb8f", fontWeight: 900, flexShrink: 0 }}>✓</span>{b}
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.92)", fontWeight: 700, lineHeight: 1.5, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.1)" }}>
          {UNLOCK_LINE[role]}
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", color: "#1f2428", marginBottom: 14 }}>
        {friseTitle}
      </div>
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "6px 18px", marginBottom: 22 }}>
        {FRISE_STEPS[role].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "26px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
            <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "rgba(212,64,0,.09)", color: "#d44000", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 900, color: "#1f2428" }}>{s.title}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#d44000", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.period}</span>
              </div>
              <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.5, marginBottom: 10 }}>{s.text}</div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", top: 8, right: 8, zIndex: 2, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,.9)", background: "rgba(0,0,0,.5)", padding: "3px 8px", borderRadius: 999 }}>
                  Aperçu
                </div>
                {i === 0 && <PlanningPreview sport={sport} />}
                {i === 1 && (role === "coach" ? <CoachControlPreview name={name} /> : <WellnessCardPreview />)}
                {i === 2 && (role === "coach" ? <AthleteChargePreview /> : <ChargePreview />)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 12 }}>
          Les experts en parlent
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {INTERVIEWS.filter(v => v.personas.includes(role === "coach" ? "coach" : "athlete")).map(v => (
            <div key={v.slug} style={{ flex: "0 0 240px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#111" }}>
                <img src={`/testimonials/${v.slug}.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", bottom: 8, right: 8, fontSize: 10, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,.55)", padding: "3px 8px", borderRadius: 5, letterSpacing: "0.02em" }}>▶ YouTube</div>
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1f2428" }}>{v.name}</div>
                <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 2, lineHeight: 1.35 }}>{v.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 12 }}>
          Ce que disent des {role === "coach" ? "coachs" : "sportifs"} comme vous
        </div>
        <div style={{ padding: "14px 16px 12px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
          <div style={{ fontSize: 13, color: "#3a3f44", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
            &ldquo;{testimonial.quote}&rdquo;
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
              <img src={testimonial.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>{testimonial.name}</div>
              <div style={{ fontSize: 11, color: "#8a8f94" }}>{testimonial.role}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#f28a00", fontSize: 12 }}>★</span>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, padding: "12px 14px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
        <div style={{ display: "flex" }}>
          {PAYWALL_AVATARS.map((src, i) => (
            <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #f1f0ee", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#1f2428", lineHeight: 1.2 }}>+600 sportifs, coachs et clubs</div>
          <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>font confiance à ThePerfClub</div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 4 }}>
          Questions fréquentes
        </div>
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, padding: "4px 16px" }}>
          {faqItems(role).map((item, i) => (
            <div key={i} style={{ padding: "14px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2428", marginBottom: 6 }}>{item.q}</div>
              <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.55 }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
