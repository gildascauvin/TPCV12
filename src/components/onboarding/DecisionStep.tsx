"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";
import { AhaBilanPreview, AhaDecisionPreview, AhaFormPeakPreview, AhaRadarPreview, AhaGroupBilanPreview } from "@/components/onboarding/AhaPreviews";
import type { SessionTemplate } from "@/types";

/* Écran de décision — 9e itération (2026-09-02, dernière refonte de la journée) : garde le split
   plein-bleed "comme le wizard coupé en 2" de l'itération précédente, mais avec 3 changements
   demandés explicitement par Gildas :
   - Illustrations remplacées par les VRAIES versions complètes des composants prod (pas les
     variantes compactes de FrisePreviews déjà utilisées ailleurs — voir chaque item ci-dessous),
     "avec animation des wellness ring en arrivant, et les lines de chart qui se dessinent etc" —
     gratuit : ces animations sont déjà intégrées aux composants réels réutilisés, rien à construire.
   - Plus de titre au-dessus des 3 bullets ("pas besoin de titre si c'est pour répéter la même chose
     que la value" — value_intro porte déjà ce message).
   - Timer visualisé en barres horizontales façon wizard (WizardHero, OnboardingFlow.tsx) — chaque
     segment se remplit progressivement sur AUTO_MS, pas un simple indicateur statique "étape N/3".
   - Mobile : illustration en haut, bullets ("expand/collapse") en bas — inversé par rapport à
     l'itération précédente. Repassé en layout figé sur la hauteur d'écran (100dvh) le 2026-09-02 —
     les bullets/CTA doivent rester visibles sans scroll, voir doc sur la branche mobile plus bas.
   Wording des 3 items, donné explicitement par Gildas (adapté role-aware) :
     1 "Obtiens ton score de forme" (sportif) / "Suis la forme de tes sportifs" (coach, ajusté
       2026-09-02 à deux reprises — le wording sportif ne marchait pas tel quel côté coach, puis
       "score de" retiré) — sommeil/stress/comportements → un score chaque matin.
     2 "Ajuste tes séances" — surcharge/allège pour optimiser la performance et éviter les blessures.
     3 "Obtiens des recommandations" — ce qui freine/aide, prédit les pics de forme, évite le
       sur-entraînement.
   Typographie du titre/sous-titre actifs alignée sur WizardHero (OnboardingFlow.tsx, variante dark) —
   demande explicite de Gildas 2026-09-02 : "même taille de typo que dans le wizard" (26px/950/-0.03em
   pour le titre, 15px/rgba(.6) pour le sous-titre) ; seul l'item actif prend cette taille, les items
   inactifs restent des libellés de navigation plus discrets. Fond de la colonne illustration desktop
   passé de blanc à `#f1f0ee` (2026-09-02, "bg gris comme en prod") — les 3 illustrations sont soit
   des cartes dark, soit des cartes blanches (SessionMiniCard) : les secondes doivent reposer sur le
   vrai fond de page de l'app, pas sur du blanc pur.
   Illustrations, réutilisent les VRAIS composants prod tels quels (FrisePreviews.tsx) — révisées
   une 2e fois le 2026-09-04 (retour de Gildas après un 1er passage jugé pas assez fidèle) :
     1 → FullWellnessAdvicePreview() côté sportif — reconstruit la vraie carte "Score & conseils" de
         /today (ring, zone relative, comportements, blocs ⚡ Entraînement/🌿 Récupération via
         loadRule()/getRecoveryAdvice()), SANS encart d'ajustement (pas de suggestion affichée).
         CoachAthleteRowsPreview() côté coach — 3 lignes empilées, exactement le rendu de la liste
         /coach/athletes (AthleteRing/athleteStatus réexportées d'AthletesClient.tsx, badge Charge
         via sigDimInfo), 3 scores différents, sans séance ni encart de décision/ajustement.
     2 → SingleSessionAdjustPreview({sport}) côté sportif — une seule carte séance (DayColumn/
         WeekSessionCard), alerte Alléger + rendu avant/après barré de chaque ligne d'exercice
         (parseAndApply()). ProgramPreview3Days({role,sport}) inchangée côté coach (2 jours, tabs
         sportifs), désormais centrée en desktop et avec le même rendu avant/après barré sur le jour
         d'alerte.
     3 → CombinedInsightPreview({perspective}) — un seul vrai SparkLineClient, ligne wellness +
         ligne charge, avec l'insight croisé (TrendInsight) au-dessus. Inchangée.
   2026-10-28 (POC https://claude.ai/artifact/H5zyp9dymAYsk3v1ZoTtGG, validé par Gildas) : plus de
   score de forme côté sportif (« on vend pas ça »). Sportif : 1 bilan (synthèse) → 2 ajustement →
   3 forme + charge, titres orientés bénéfice. Coach : seule l'étape 3 change (bilan du groupe en
   synthèse, au lieu de la liste Charge). Bilans en écran de synthèse, jamais en story qui défile :
   les 3 étapes sont déjà minutées.
   `role` déjà connu à ce stade (choisi sur `value_intro`, qui précède ce step et reste inchangé) :
   wording role-aware normal. Toujours sans geste interactif réel (Alléger/Surcharger + célébration)
   — décision de Gildas plus tôt le même jour, reportée post-signup ; les boutons visibles dans les
   illustrations (item 2) restent non-cliquables (`pointerEvents:none`, voir FrisePreviews.tsx).
   Mobile — 2e refonte le 2026-09-02 (demande explicite de Gildas, layout précisé point par point :
   "frise, titre, sous titre, image (quand étendu), etc") : abandonne le split "illustration pinnée
   en haut / bullets fixes en bas" (qui datait de la même journée) pour un accordéon en flux normal —
   toute la page passe en fond sombre (`#141414`), la frise (barres) ouvre l'écran, puis chaque item
   affiche son numéro+titre toujours visible, et seul l'item actif déplie sous lui son sous-titre PUIS
   son illustration (`showIllustration` sur `BulletItem`, voir plus bas) — jamais d'illustration
   séparée pinnée ailleurs sur l'écran. Le CTA reste un footer `flexShrink:0` non-scrollable en bas
   (même convention que partout ailleurs dans l'onboarding), sur le même fond sombre que le reste. */

type Role = "athlete" | "coach";

interface Props {
  demoHardest?: SessionTemplate | null;
  demoLightest?: SessionTemplate | null;
  demoMiddle?: SessionTemplate | null;
  sport: string;
  role: Role;
  athleteName?: string;
  onNext: () => void;
  onBack?: () => void;
}

const AUTO_MS = 5000;

/* L'illustration tient en entier au-dessus du bouton (31/10) : elle était coupée par le footer sur
   iPhone. Réduite jusqu'à 72 % de sa taille ; en dessous, la zone défile comme avant. */
function FitBox({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 1, h: 0 });
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = i.offsetHeight, avail = o.clientHeight;
      if (!h || !avail) return;
      setFit({ s: Math.max(0.72, Math.min(1, avail / h)), h });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o); ro.observe(i); measure();
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} style={{ flex: 1, minHeight: 0, overflowY: fit.s <= 0.72 ? "auto" : "hidden" }}>
      <div style={{ height: fit.h ? fit.h * fit.s : undefined }}>
        <div ref={inner} style={{ transform: `scale(${fit.s})`, transformOrigin: "top center" }}>{children}</div>
      </div>
    </div>
  );
}

export default function DecisionStep({ sport, role, athleteName, onNext, onBack }: Props) {
  const { isMd } = useBreakpoint();
  const coach = role === "coach";
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  /* Défilement automatique (31/10) : s'arrête au 3e item au lieu de boucler, se met en pause dès qu'on
     touche l'illustration ou que l'onglet est masqué, et ne démarre pas en mouvement réduit. */
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPaused(true);
    const onVis = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (paused || activeIdx >= 2) return;
    const t = setTimeout(() => setActiveIdx(i => i + 1), AUTO_MS);
    return () => clearTimeout(t);
  }, [activeIdx, paused]);

  function selectIdx(i: number) {
    setActiveIdx(i);
    setPaused(true);
  }

  const items = [
    {
      title: coach ? "Vois qui est vraiment en forme" : "Découvre ce qui pèse sur tes séances",
      desc: coach
        ? "Sommeil, stress, courbatures et comportements de chacun de tes sportifs : un score calculé chaque matin."
        : "Soirée, stress, sommeil, séances trop dures : ton bilan montre ce qui pèse vraiment sur tes séances. Chez toi, pas en moyenne.",
      illustration: coach ? <AhaRadarPreview /> : <AhaBilanPreview />,
    },
    {
      title: coach ? "Ajuste les séances en un clic" : "Ta séance s'ajuste chaque matin",
      desc: coach
        ? "Surcharge ou allège les séances de tes sportifs pour optimiser leurs gains de performance et éviter les blessures."
        : "Surcharge ou allège tes séances pour optimiser tes gains de performance et éviter les blessures.",
      illustration: coach ? <AhaDecisionPreview name="Karim Haddad" /> : <AhaDecisionPreview />,
    },
    {
      title: coach ? "Vois qui décroche avant qu'il lâche" : "Arrive en forme le jour J, sans te blesser",
      desc: coach
        ? "Chaque semaine, le bilan de ton groupe : qui décroche, les séances que tu écris trop légères, ce que l'app apprend de chacun, qui monte trop vite."
        : "Ta forme et ta charge suivies semaine après semaine : tu sais quand viser un record, et quand lever le pied avant la blessure.",
      illustration: coach ? <AhaGroupBilanPreview /> : <AhaFormPeakPreview />,
    },
  ];
  const active = items[activeIdx];

  // Timer visualisé en barres horizontales (2026-09-04, demande explicite de Gildas : "comme le
  // wizard") — chaque segment se remplit sur AUTO_MS (animation CSS), remise à zéro à chaque
  // changement d'item via `key={activeIdx}` (force le remount, donc le redémarrage de l'animation).
  // En pause (clic manuel) : le segment actif reste figé plein, pas d'animation. Porte aussi le
  // `<style>` des keyframes — timerBars est le seul bloc rendu identiquement sur les 2 branches
  // (desktop/mobile), donc le point sûr pour ne déclarer l'animation qu'une fois.
  const timerBars = (
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {[0, 1, 2].map(i => {
        const isPastAuto = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 999, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
            <div
              key={isActive ? activeIdx : undefined}
              style={{
                height: "100%", borderRadius: 999, background: "#d44000", transformOrigin: "left",
                transform: `scaleX(${isPastAuto || (isActive && paused) ? 1 : 0})`,
                animation: isActive && !paused ? `decisionBarFill ${AUTO_MS}ms linear forwards` : undefined,
              }}
            />
          </div>
        );
      })}
      <style>{`@keyframes decisionBarFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
    </div>
  );

  // Une seule ligne d'item, partagée desktop/mobile — ne rend plus jamais l'illustration elle-même
  // (2026-09-04, retour de Gildas : les 3 titres/sous-titre doivent tous rester visibles en haut,
  // l'illustration de l'item actif se déplie dans un unique emplacement partagé SOUS la liste des
  // 3 bullets, jamais interleavée entre deux d'entre eux — voir le bloc dédié dans chaque branche
  // desktop/mobile plus bas, qui remplace l'ancien `showIllustration` sur ce composant).
  function BulletItem({ item, i }: { item: typeof items[number]; i: number }) {
    const isActive = i === activeIdx;
    return (
      <button
        onClick={() => selectIdx(i)}
        style={{
          textAlign: "left", background: "none", border: "none", cursor: "pointer", width: "100%",
          padding: "14px 0", display: "flex", alignItems: "flex-start", gap: 14,
          borderTop: i > 0 ? "1px solid rgba(255,255,255,.08)" : "none",
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${isActive ? "#d44000" : "rgba(255,255,255,.25)"}`,
          background: isActive ? "#d44000" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: isActive ? "#fff" : "rgba(255,255,255,.5)",
        }}>
          {i + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: isActive ? (isMd ? 26 : 22) : 16, fontWeight: isActive ? 950 : 900,
            letterSpacing: isActive ? "-0.03em" : "-0.02em", lineHeight: 1.2,
            color: isActive ? "#fff" : "rgba(255,255,255,.55)",
          }}>
            {item.title}
          </div>
          {isActive && (
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.6)", lineHeight: 1.5, marginTop: 8, animation: "stepIn 220ms cubic-bezier(.23,1,.32,1)" }}>
              {item.desc}
            </div>
          )}
        </div>
      </button>
    );
  }

  const bulletsList = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item, i) => <BulletItem key={item.title} item={item} i={i} />)}
    </div>
  );

  const heroContent = (
    <>
      {timerBars}
      {bulletsList}
    </>
  );

  const backBtn = onBack && (
    <button onClick={onBack} aria-label="Retour" style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, cursor: "pointer", fontSize: 17, border: "1.5px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "#fff" }}>←</button>
  );
  const nextBtn = (
    <button
      onClick={onNext}
      style={{ flex: 1, minHeight: 52, padding: "8px 16px", borderRadius: 16, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}
    >
      Continuer →
    </button>
  );

  if (isMd) {
    return (
      <div style={{
        width: "100vw", position: "relative", left: "50%", right: "50%",
        marginLeft: "-50vw", marginRight: "-50vw", marginTop: -36, marginBottom: -120,
        display: "flex", height: "100dvh",
      }}>
        <div style={{ flex: "0 0 42%", background: DARK_CARD_BG, display: "flex", alignItems: "center", padding: "0 48px", overflowY: "auto" }}>
          <div style={{ maxWidth: 440 }}>{heroContent}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f1f0ee" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "48px", display: "flex", alignItems: "center" }}>
            <div key={activeIdx} style={{ width: "100%", maxWidth: 720, margin: "0 auto", animation: "stepIn 220ms cubic-bezier(.23,1,.32,1)" }}>
              {active.illustration}
            </div>
          </div>
          <div style={{ flexShrink: 0, background: "#f1f0ee", padding: "16px 40px 24px", display: "flex", gap: 10 }}>
            {backBtn}{nextBtn}
          </div>
        </div>
      </div>
    );
  }

  // Mobile — accordéon en flux normal, toute la page en fond sombre (2026-09-02, remplace le split
  // "illustration pinnée / bullets fixes" de la même journée — voir doc en tête de fichier). Refonte
  // 2026-09-04 (retour explicite de Gildas, capture à l'appui) : les 3 titres (+ sous-titre de
  // l'actif) restent TOUJOURS tous visibles en haut, jamais coupés par une illustration interleavée
  // — l'illustration de l'item actif se déplie dans un unique bloc blanc à coins arrondis SOUS la
  // liste complète des 3 bullets (peut déborder en bas, la zone est scrollable), plutôt que sous
  // l'item lui-même. CTA reste un footer `flexShrink:0` non-scrollable en bas (même convention que
  // partout ailleurs dans l'onboarding) — toujours visible même si l'illustration est haute.
  return (
    <div style={{
      width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw",
      marginTop: -36, marginBottom: -120, display: "flex", flexDirection: "column", height: "100dvh",
      background: DARK_CARD_BG,
    }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "20px 16px 8px" }}
        onPointerDown={() => setPaused(true)}>
        {timerBars}
        {bulletsList}
        {/* Fond sombre conservé derrière l'illustration (2026-09-04, retour de Gildas) — pas de
            carte claire dessous, contrairement à la colonne desktop (#f1f0ee) : ici l'illustration
            (carte dark ou carte blanche selon l'item) repose directement sur le fond `#141414` de
            toute la page. */}
        <div key={activeIdx} style={{ marginTop: 16, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", animation: "stepIn 220ms cubic-bezier(.23,1,.32,1)" }}>
          <FitBox>{active.illustration}</FitBox>
        </div>
      </div>
      {/* Fond transparent (2026-09-25, DARK_CARD_BG) — le dégradé radial du parent (100dvh) est déjà
         peint derrière ce footer ; le répéter ici recalculerait le gradient relatif à la petite boîte
         du footer (position % différente) au lieu du même dégradé continu, créant une coupure visible
         à la frontière. Transparent laisse le fond du parent transparaître sans couture. */}
      <div style={{ flexShrink: 0, background: "transparent", padding: "14px 20px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 10 }}>
        {backBtn}{nextBtn}
      </div>
    </div>
  );
}
