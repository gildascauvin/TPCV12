"use client";

import { PRICING } from "./PaywallModal";
import type { Billing } from "./PaywallModal";
import { INTERVIEWS } from "./interviews";
import ShareButton from "@/components/sessions/ShareButton";

/* Contenu partagé entre PrimingJourneyModal.tsx (paywall in-app, gating free/expired) et l'étape
   paywall_priming de l'onboarding (OnboardingFlow.tsx) — un seul point de vérité pour le badge,
   le prix, le mécanisme en 3 étapes, la vidéo carousel et la FAQ.
   Décision explicite de Gildas (2026-08-07) : ces deux écrans doivent être "exactement le même
   composant" pour ne plus jamais diverger sur le wording. Le shell (modal dismissible vs page
   pleine largeur) et le CTA final restent propres à chaque appelant — seul le contenu entre le
   badge et le CTA vit ici.

   2026-09-16 — split gauche (valeur, PricingPrimingValue)/droite (offre, PricingPrimingContent) :
   témoignage + bande "+600" déplacés vers PaywallModal.tsx (le form de paiement, pas ici), voir
   ce fichier pour le détail — "comme le POC" fourni par Gildas.

   2026-09-13 — retour de l'essai (14 jours, CB requise, 0€ dû aujourd'hui), remplace la garantie
   remboursé 14 jours du 2026-08-07 — voir CLAUDE.md pour l'historique complet des deux décisions.
   Consigne explicite de Gildas : ne jamais communiquer sur "essai gratuit" ni sur un rappel avant
   facturation — le wording parle de "14 jours offerts" et d'annulation en 1 clic, jamais d'un
   email de rappel à venir. */
const TRIAL_DAYS = 14;

/* Sous le CTA "Continuer →" de l'écran priming (pas dans la carte prix elle-même — retiré de là
   le 2026-08-07 à la demande de Gildas), sur les deux surfaces (modal in-app + onboarding). */
export const PRICING_PRIMING_GUARANTEE_CAPTION = "✓ Annulation en 1 clic, sans engagement.";

/* Sous-titre par défaut du panneau de valeur (PricingPrimingValue) quand l'appelant n'en fournit
   pas (cas générique, pas de programme claimé) — remplace l'ancien bloc "UNLOCK_LINE" en gras
   dans la carte prix, retiré de là le 2026-09-16 (voir STEPS ci-dessous, "comme le POC" de Grok :
   mécanisme en 3 étapes plutôt qu'une ligne de synthèse + une liste de bullets séparée). */
const UNLOCK_LINE: Record<"athlete" | "coach", string> = {
  athlete: "Ton programme est déjà prêt. Débloque-le et laisse ThePerfClub ajuster chaque séance.",
  coach: "Ton système de suivi est prêt. Débloque-le et laisse ThePerfClub t'aider à prendre les bonnes décisions pour chaque sportif, à chaque séance.",
};

/* Mécanisme en 3 étapes fusionné dans la carte prix (2026-09-16) — 3e itération, retour explicite
   de Gildas : titres redevenus juste "Enregistre/Cible/Progresse" (sans le préfixe "Aujourd'hui —
   /Pendant 14 jours —/Ensuite —" de la 2e itération), texte final donné verbatim par Gildas. Coach
   = même structure, wording en miroir. */
const STEPS: Record<"athlete" | "coach", { title: string; text: string }[]> = {
  athlete: [
    { title: "Enregistre", text: "Enregistre tes séances et ton ressenti et identifie ce qui joue sur tes performances." },
    { title: "Cible", text: "Cible les comportements qui pèsent le plus et les faiblesses qui te freinent." },
    { title: "Progresse", text: "Ta charge s'ajuste automatiquement à ta vraie récupération." },
  ],
  coach: [
    { title: "Enregistre", text: "Enregistre les séances et le ressenti de tes sportifs et identifie ce qui joue sur leurs performances." },
    { title: "Cible", text: "Cible les comportements qui pèsent le plus et les faiblesses qui les freinent." },
    { title: "Progresse", text: "Leur charge s'ajuste automatiquement à leur vraie récupération." },
  ],
};

function faqItems(role: "athlete" | "coach") {
  return [
    { q: "Vais-je être facturé automatiquement à la fin des 14 jours offerts ?", a: "Oui, sauf annulation avant la fin des 14 jours — annulable en un clic depuis ton profil, sans engagement." },
    { q: "Puis-je annuler à tout moment ?", a: "Oui, en un clic depuis ton profil, sans justification ni délai de préavis." },
    { q: "Puis-je changer de formule après ?", a: "Oui, tu peux basculer entre mensuel et annuel à tout moment depuis ton profil." },
    role === "coach"
      ? { q: "Puis-je ajouter autant de sportifs que je veux ?", a: "Oui, sans surcoût, quel que soit le nombre de sportifs que tu coaches." }
      : { q: "Le programme est-il vraiment personnalisé ?", a: "Oui : il est généré selon ton sport, ton niveau et ton objectif, puis ajusté automatiquement selon ta récupération." },
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
  /** Sport réel de l'utilisateur — plus consommé ici depuis le retrait de la frise (2026-09-14),
      gardé dans le contrat pour ne pas casser les appelants (PrimingJourneyModal.tsx/
      OnboardingFlow.tsx) qui le passent encore. */
  sport?: string;
  /** Nombre réel de séances du programme généré (weeks × jours d'entraînement) — absent en gating in-app (pas de génération en cours), un bullet non chiffré prend le relais. */
  sessionCount?: number;
  /** Libellés réels des faiblesses choisies à level_2a — sportif uniquement (2026-08-17, 2e
      itération). Côté coach, BULLETS.coach fait déjà 3 lignes sans ça ; côté sportif, sans ce
      bullet il n'en restait que 2 (compteur de séances + 1 bullet statique) — retour de Gildas :
      "je veux bien 3 check... comme ça coach et sportif ont 3 check en tout". Absent/vide → bullet
      retiré (pas de filler générique), sportif retombe alors à 2. */
  weaknessLabels?: string[];
  /** Prénom réel de l'utilisateur — utilisé dans les illustrations de la frise (sportif démo côté
      coach) pour rester personnel. Repli "Toi" si absent, même convention que coachFirstName dans
      WeekPreviewStep.tsx. */
  name?: string;
  /** Sportif uniquement (2026-09-14, voir CLAUDE.md — simplifié le lendemain d'une 1re version
      "comme un programme claimé" du 13/09 : plus de dépendance à un programme existant) — id du
      compte sportif courant, pour "Inviter mon coach →" (construit /register?role=coach&
      athleteId=...&athleteName=..., aucun appel réseau). Disponible dès la création du compte,
      pas seulement après avoir construit un programme dans le wizard. */
  athleteSelfId?: string;
}

/* Panneau "valeur" du split gauche (dark)/droite (actions) — même layout que le reste du wizard
   (WizardHero + contenu à gauche, formulaire/actions à droite — ProgramCreatePicker.tsx/
   ProgramCriteriaModal.tsx/WellnessModal.tsx/InviteModal.tsx/ProgramAssignModal.tsx).

   2026-09-16, 4e itération — retour explicite de Gildas : ni illustration (chart recup/fatigue,
   déjà vu à decision_2a/2b) ni liste de bullets génériques ("Ton programme sur mesure, déjà
   généré"/"Ajusté selon ta récupération") — l'effort de personnalisation doit porter sur le
   headline/sub eux-mêmes (avec les vraies infos connues de l'onboarding : sport, wellness, noms
   des sportifs), pas sur une liste à côté. Ce composant ne rend donc plus que headline+sub — voir
   OnboardingFlow.tsx/PrimingJourneyModal.tsx pour les propositions de wording personnalisé (pas
   encore câblées, en attente de validation du wording par Gildas). */
export function PricingPrimingValue({ role, headline, sub, dark = true }: {
  role: "athlete" | "coach"; headline: string; sub?: string | null;
  /** Défaut true = panneau gauche desktop (fond DARK_CARD_BG). PrimingJourneyModal.tsx passe false pour
      l'usage mobile (fond clair du drawer, #f1f0ee) — sans ça le titre/sous-titre blancs
      deviennent invisibles (bug réel signalé par Gildas, 2026-09-16). */
  dark?: boolean;
}) {
  /* Repli sur UNLOCK_LINE (2026-09-16, retour explicite de Gildas — "améliore tes performances
     maintenant / ton programme est déjà prêt... comme le POC") quand l'appelant ne fournit pas de
     sous-titre (cas générique, pas de programme claimé) — `sub === null` reste un moyen explicite
     de le masquer si un appelant le veut un jour, `undefined` déclenche le repli. */
  const subText = sub === null ? null : (sub ?? UNLOCK_LINE[role]);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 27, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10, lineHeight: 1.2, color: dark ? "#fff" : "#171b1f" }}>{headline}</div>
      {subText && <div style={{ fontSize: 14, color: dark ? "rgba(255,255,255,.6)" : "#8a8f94" }}>{subText}</div>}
    </div>
  );
}

/* sessionCount/weaknessLabels ne sont plus consommés ici (2026-09-16) — restent dans
   PricingPrimingProps (le contrat partagé) mais pas déstructurés, pour éviter une confusion
   "acceptés mais ignorés". */
export function PricingPrimingContent({ role, billing, setBilling, name, athleteSelfId }: Omit<PricingPrimingProps, "headline" | "sub">) {
  const p = PRICING[role];
  const isMonthly = billing === "monthly";
  const annualSavings = p.monthly * 12 - p.annual;
  const annualSavingsPct = Math.round((annualSavings / (p.monthly * 12)) * 100);
  const steps = STEPS[role];

  return (
    <div>
      <div style={{
        position: "relative", overflow: "hidden",
        background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
        border: "1px solid rgba(255,255,255,.13)", borderRadius: 16, padding: "18px 18px 16px",
        marginBottom: 22, boxShadow: "0 20px 48px rgba(0,0,0,.22)",
      }}>
        <div style={{ position: "absolute", top: 16, right: 16, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#7fdb8f", background: "rgba(47,158,68,.20)", padding: "5px 10px", borderRadius: 999 }}>
          ✓ {TRIAL_DAYS} jours offerts
        </div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1, marginTop: 24 }}>
          0€<span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>aujourd&apos;hui</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginTop: 9, lineHeight: 1.5 }}>
          {isMonthly
            ? `Puis ${p.monthly}€/mois après tes ${TRIAL_DAYS} jours offerts.`
            : `Puis ${p.annual}€/an (${p.annualMonthly.toFixed(2).replace(".", ",")}€/mois) après tes ${TRIAL_DAYS} jours offerts.`}
        </div>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: 3, marginTop: 12 }}>
          <button type="button" onClick={() => setBilling("annual")} style={{ border: "none", background: !isMonthly ? "#d44000" : "transparent", color: !isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>
            Annuel<span style={{ fontFamily: "var(--font-mono), monospace", marginLeft: 5, fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 999, background: "rgba(47,158,68,.18)", color: "#2f9e44" }}>-{annualSavingsPct}%</span>
          </button>
          <button type="button" onClick={() => setBilling("monthly")} style={{ border: "none", background: isMonthly ? "#d44000" : "transparent", color: isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>Mensuel</button>
        </div>

        {/* Mécanisme en 3 étapes (2026-09-16, "comme le POC" — voir STEPS ci-dessus) : remplace
            l'ancienne liste de bullets + la ligne UNLOCK_LINE en gras. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, marginBottom: 4 }}>
          {steps.map((s, i) => (
            <div key={s.title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* Numéro neutre pour les 3 étapes (2026-09-16, retour explicite de Gildas — "je
                  veux pas que le 1,2,3 soit coloré en fond rouge") : plus de mise en avant du
                  step 1. */}
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700,
                background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.7)",
              }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 1 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.4 }}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA secondaire sur une seule ligne (2026-09-16, retour explicite de Gildas — "ca
            marcherait mieux sur une ligne" + "plutôt qu'un bouton un lien") : plus de bloc
            bordé pleine largeur, un lien texte inline après le contexte. Coach : intro chaude
            avant un funnel self-serve froid. Sportif : "gratuit avec un coach", lien /register
            direct (id + prénom en clair dans l'URL, aucun programme requis — voir doc de
            athleteSelfId ci-dessus). Absent si athleteSelfId inconnu (repli sûr, jamais un lien
            qui pointerait vers personne). */}
        {role === "coach" ? (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.14)", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.78)" }}>
            Une question ? →{" "}
            <a
              href="https://calendly.com/cauvingildas/30min" target="_blank" rel="noopener noreferrer"
              style={{ color: "#ff8a55", fontWeight: 800, textDecoration: "underline" }}
            >
              Demander une démo
            </a>
          </div>
        ) : athleteSelfId && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.14)", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.78)" }}>
            Gratuit avec un coach →{" "}
            <ShareButton
              linkLabel="Inviter mon coach"
              title="Hey coach, ThePerfClub m'aide à structurer mon entraînement — rejoins-moi pour me coacher dessus !"
              variant="dark"
              getShareUrl={async () =>
                `${window.location.origin}/register?role=coach&athleteId=${encodeURIComponent(athleteSelfId)}&athleteName=${encodeURIComponent(name ?? "")}`
              }
            />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 12 }}>
          Les experts en parlent
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {INTERVIEWS.filter(v => v.personas.includes(role === "coach" ? "coach" : "athlete")).map(v => (
            <div key={v.slug} style={{ flex: "0 0 240px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#111" }}>
                <img src={`/testimonials/${v.slug}.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <div style={{ fontFamily: "var(--font-mono), monospace", position: "absolute", bottom: 8, right: 8, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.55)", padding: "3px 8px", borderRadius: 5, letterSpacing: "0.02em" }}>▶ YouTube</div>
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, color: "#1f2428" }}>{v.name}</div>
                <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 2, lineHeight: 1.35 }}>{v.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Témoignage + bande "+600" déplacés vers le form de paiement (2026-09-16, retour explicite
          de Gildas — "c'est censé être au form de paiement") : PaywallModal.tsx, panneau gauche
          desktop / bas du formulaire mobile. Ne restent plus ici que la vidéo carousel ("Les
          experts en parlent", ci-dessus) et la FAQ (ci-dessous). */}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 4 }}>
          Questions fréquentes
        </div>
        {/* Accordéon natif <details>/<summary> (2026-09-16, "comme le POC" — retour explicite de
            Gildas), remplace l'ancien affichage question+réponse toujours dépliées. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {faqItems(role).map((item, i) => (
            <details key={i} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 12 }}>
              <summary style={{ fontFamily: "var(--font-display)", padding: "13px 16px", fontSize: 13.5, fontWeight: 700, color: "#1f2428", cursor: "pointer", listStyle: "revert" }}>
                {item.q}
              </summary>
              <div style={{ padding: "0 16px 13px", fontSize: 13, color: "#62686e", lineHeight: 1.55 }}>
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
