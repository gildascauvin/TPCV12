"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramTemplate, ProgramLevel, ProgramFocus } from "@/types";
import type { ProgramMeta } from "./ProgramCriteriaModal";
import { SPORT_CATEGORIES, guessSportChip } from "@/lib/sportCategories";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Bibliothèque publique, native (2026-09-04) — remplace le lien externe vers la page WordPress
   ("Utiliser un modèle" du picker de création, ProgramCreatePicker.tsx) : demande explicite de
   Gildas, "que ça passe à une step suivante avec la liste des programmes avec des filtres, comme ça
   c'est natif" plutôt qu'ouvrir un nouvel onglet. Même drawer/shell que ProgramCriteriaModal.tsx
   (heroOnLeft desktop, hideClose/onBack pour le wizard) — un seul composant réutilisé par
   ProgramLibraryPage.tsx (in-app) ET OnboardingFlow.tsx (wizard_picker), même principe que tous les
   autres pickers de ce chantier.

   Catégorisation (2026-09-04, suite) — retour de Gildas après un premier passage : "il manque des
   catégories de filtre" (28 des 66 programmes réels ne matchaient aucune des 8 SPORT_CATEGORIES de
   sport_2a, vérifié en base — Prevention/Reeducation ×8, concours physiques ×5, une quinzaine de
   sports individuels non couverts type Padel/Golf/Escalade/BMX...). `SPORT_CATEGORIES` reste
   inchangée (partagée avec sport_2a, qui pilote le vrai générateur — l'étendre là-bas impliquerait
   du contenu de curriculum réel, hors scope) : 3 catégories supplémentaires ajoutées ICI seulement,
   locales à ce composant, plus un repli générique ("Autres sports") — categoryFor() ne renvoie donc
   plus jamais `null`, chaque programme a toujours un chip auquel se rattacher. Un champ de recherche
   (nom + sport) complète les chips, plus rapide pour un programme précis noyé dans "Autres sports". */

interface LibraryProgram {
  id: string;
  name: string;
  sport: string | null;
  level: ProgramLevel | null;
  focus: ProgramFocus | null;
  weeks_count: number;
  sessions_per_week: number;
  template: ProgramTemplate;
}

const LEVEL_LABELS: Record<string, string> = {
  debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", elite: "Élite",
};

const EXTRA_CATEGORIES = [
  { id: "Rééducation & Prévention", icon: "🩹", match: /pr[ée]vention|r[ée][ée]ducation/i },
  { id: "Concours & Sélections",    icon: "🎖️", match: /gendarmerie|police|sapeur|gign|arm[ée]e/i },
] as const;
const OTHER_CATEGORY = { id: "Autres sports", icon: "🧭" };

// Ne renvoie jamais null — repli sur OTHER_CATEGORY si rien ne matche, pour que chaque programme
// ait toujours un chip (voir doc en tête de fichier).
function categoryFor(sport: string | null): { id: string; icon: string } {
  if (!sport) return OTHER_CATEGORY;
  const known = guessSportChip(sport);
  if (known) {
    const c = SPORT_CATEGORIES.find(x => x.id === known);
    if (c) return { id: c.id, icon: c.icon };
  }
  const extra = EXTRA_CATEGORIES.find(c => c.match.test(sport));
  return extra ?? OTHER_CATEGORY;
}

interface Props {
  onClose: () => void;
  onBack: () => void;
  hideClose?: boolean;
  wizardHero?: React.ReactNode;
  onSelect: (template: ProgramTemplate, meta: ProgramMeta, name: string) => void;
}

export default function ProgramLibraryBrowser({ onClose, onBack, hideClose, wizardHero, onSelect }: Props) {
  const { isMd } = useBreakpoint();
  const heroOnLeft = !!wizardHero && isMd;
  const [programs, setPrograms] = useState<LibraryProgram[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/programs/library")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { programs: LibraryProgram[] }) => { if (!cancelled) setPrograms(d.programs ?? []); })
      .catch(() => { if (!cancelled) { setPrograms([]); setError(true); } });
    return () => { cancelled = true; };
  }, []);

  // Un chip par catégorie réellement présente dans les données — jamais un filtre qui mènerait
  // systématiquement à une liste vide.
  const categoriesPresent = useMemo(() => {
    if (!programs) return [];
    const present = new Map<string, { id: string; icon: string }>();
    programs.forEach(p => { const c = categoryFor(p.sport); present.set(c.id, c); });
    const ordered = [...SPORT_CATEGORIES, ...EXTRA_CATEGORIES, OTHER_CATEGORY];
    return ordered.map(c => present.get(c.id)).filter((c): c is { id: string; icon: string } => !!c);
  }, [programs]);

  const filtered = useMemo(() => {
    if (!programs) return [];
    const q = query.trim().toLowerCase();
    return programs.filter(p => {
      if (filter && categoryFor(p.sport).id !== filter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sport ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [programs, filter, query]);

  function selectProgram(p: LibraryProgram) {
    const meta: ProgramMeta = {
      sport: p.sport ?? "",
      level: p.level ?? "intermediaire",
      focus: p.focus ?? "mixte",
      days: ["Lun", "Mer", "Ven"], // placeholder, non réutilisé après le chargement dans le builder — même convention que "Modifier" dans ProgramLibraryPage.tsx
      duration: p.weeks_count as ProgramMeta["duration"],
    };
    onSelect(p.template, meta, p.name);
  }

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
          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 20, padding: "4px 6px", borderRadius: 8, flexShrink: 0 }}>←</button>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em" }}>Bibliothèque de programmes</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>Choisis un programme existant comme point de départ</div>
              </div>
            </div>
            {!hideClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8a8f94", fontSize: 20 }}>✕</button>}
          </div>

          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un sport ou un programme…"
            style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 14 }}
          />

          {categoriesPresent.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              <FilterChip label="Tous" selected={!filter} onClick={() => setFilter(null)} />
              {categoriesPresent.map(c => (
                <FilterChip key={c.id} label={`${c.icon} ${c.id}`} selected={filter === c.id} onClick={() => setFilter(f => f === c.id ? null : c.id)} />
              ))}
            </div>
          )}

          {programs === null ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8f94", fontSize: 13 }}>Chargement…</div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8f94", fontSize: 13 }}>
              Impossible de charger la bibliothèque. Réessaie dans un instant.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8f94", fontSize: 13 }}>Aucun programme ne correspond.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(p => {
                const icon = categoryFor(p.sport).icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProgram(p)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 14,
                      padding: "16px", borderRadius: 18, border: "1px solid rgba(0,0,0,.08)",
                      background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.03)",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", lineHeight: 1.25 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>
                        {[p.sport, p.level ? LEVEL_LABELS[p.level] : null, `${p.weeks_count} semaines`, `${p.sessions_per_week}j/sem`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span style={{ color: "#c7ccd1", fontSize: 16, flexShrink: 0 }}>›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        border: selected ? "1.5px solid #d44000" : "1.5px solid rgba(0,0,0,.10)",
        background: selected ? "rgba(212,64,0,.08)" : "#fff",
        color: selected ? "#d44000" : "#555",
      }}
    >
      {label}
    </button>
  );
}
