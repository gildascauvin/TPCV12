"use client";

import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Écran racine du flux de création — remplace le menu ancré (dropdown) d'une itération
   précédente. Choix fait avec Gildas après comparaison Drive/Notion (les deux listent leurs
   méthodes de création à plat, jamais nichées dans un formulaire) puis un 2e tour sur
   confort mobile : même nombre de clics qu'un menu ancré (1 pour ouvrir, 1 pour choisir), mais
   plus d'espace tactile — un drawer plein écran sur mobile est plus confortable qu'un petit
   menu ancré au bouton. Un seul niveau (pas de fork qui mène à un autre fork) : chaque carte
   soit ouvre directement le drawer suivant (Générer/Importer, ProgramCriteriaModal.tsx ;
   Modèle, ProgramLibraryBrowser.tsx depuis le 2026-09-04 — plus un lien externe), soit agit
   immédiatement (Vierge → saut direct dans le builder). */

interface Props {
  onClose: () => void;
  onGenerate: () => void;
  onImport: () => void;
  onTemplate: () => void;
  onBlank: () => void;
  /* Wizard onboarding (2026-09-03) : bande d'habillage (dots + eyebrow + titre + sous-titre) —
     absent = comportement inchangé (usage in-app). Sur desktop, rendue dans une colonne à GAUCHE
     du drawer (2026-09-04, retour explicite de Gildas) plutôt qu'au-dessus du header à l'intérieur
     du drawer ; sur mobile (pas de place pour 2 colonnes), reste inline en haut du drawer. */
  wizardHero?: React.ReactNode;
  /* Wizard onboarding (2026-09-04) : masque le "✕" — fermer cet écran racine n'a pas de sens en
     plein onboarding. Absent = comportement inchangé (usage in-app). */
  hideClose?: boolean;
}

const OPTIONS = [
  { key: "generate", icon: "🎯", label: "Générer un programme", sub: "Sport, objectif, jours…" },
  { key: "import", icon: "📷", label: "Importer un programme", sub: "Photo ou texte collé" },
  { key: "template", icon: "📚", label: "Utiliser un modèle", sub: "Bibliothèque de programmes" },
  { key: "blank", icon: "📄", label: "Programme vierge", sub: "Semaine 100% vide" },
] as const;

export default function ProgramCreatePicker({ onClose, onGenerate, onImport, onTemplate, onBlank, wizardHero, hideClose }: Props) {
  const { isMd } = useBreakpoint();
  const handlers: Record<typeof OPTIONS[number]["key"], () => void> = {
    generate: onGenerate, import: onImport, template: onTemplate, blank: onBlank,
  };
  const heroOnLeft = !!wizardHero && isMd;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: heroOnLeft ? "flex-start" : (isMd ? "flex-end" : "stretch"),
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {heroOnLeft && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 48px 0", background: "#141414" }}>
          <div style={{ maxWidth: 480, width: "100%" }}>{wizardHero}</div>
        </div>
      )}
      <div style={{
        background: "#fff",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {wizardHero && !isMd && <div style={{ flexShrink: 0 }}>{wizardHero}</div>}
        <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {/* Header — pas de "←" ici, c'est l'écran racine du flux de création */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em" }}>Créer un programme</div>
              <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>Choisis comment démarrer</div>
            </div>
            {!hideClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8a8f94", fontSize: 20 }}>✕</button>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {OPTIONS.map(o => (
              <CreateOptionCard key={o.key} icon={o.icon} label={o.label} sub={o.sub} onClick={handlers[o.key]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateOptionCard({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14,
        padding: "18px", borderRadius: 18, border: "1px solid rgba(0,0,0,.08)",
        background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.03)",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 13, background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", lineHeight: 1.25 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: "#8a8f94", marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ color: "#c7ccd1", fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  );
}
