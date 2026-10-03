"use client";

import { useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  SPORT_CATALOG, SPORT_FAMILIES, GROUPED_FAMILIES, TOP_SPORTS,
  catalogEntry, entryLabel, findCatalogEntry, searchSports, fold,
} from "@/lib/sportCatalog";

/* Bloc « Sport » partagé par « Générer une séance » (SessionQuickFill) et « Générer un programme »
   (ProgramCriteriaModal) — POC https://claude.ai/artifact/RdwmSKtebsstSN4P1bwNzK, 2026-10-03.
   3 couches :
   1. 8 cartes, le sport du profil en tête s'il est hors de ces 8 ;
   2. une recherche instantanée sur tout le catalogue (synonymes compris), l'IA en dernière ligne ;
   3. « + Plus de sports » ouvre le catalogue par famille (Rééducation et Concours à 2 niveaux) :
      panneau qui monte du bas en mobile, fenêtre centrée en desktop.
   Le composant ne fait aucun appel : il remonte une valeur du catalogue (onSelect) ou un texte libre
   à analyser (onAnalyze), chaque parent garde son appel à /api/sports/custom. */

type Props = {
  value: string;                    // valeur du catalogue sélectionnée, "" sinon
  customLabel?: string | null;      // sport libre déjà analysé (affiché en ✓)
  profileSport?: string | null;
  analyzing?: boolean;
  analysisFailed?: boolean;
  initialQuery?: string;
  onSelect: (value: string) => void;
  onAnalyze: (text: string) => void;
};

const chip = (on: boolean, dashed = false): React.CSSProperties => ({
  padding: "7px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
  border: on ? "2px solid #d44000" : dashed ? "2px dashed rgba(212,64,0,.45)" : "2px solid rgba(0,0,0,0.08)",
  background: on ? "rgba(212,64,0,0.10)" : "#fff",
  color: on ? "#d44000" : dashed ? "#d44000" : "#5f656b",
  fontWeight: 600, fontSize: 13, fontFamily: "inherit",
});

export default function SportPicker({ value, customLabel, profileSport, analyzing, analysisFailed, initialQuery, onSelect, onAnalyze }: Props) {
  const { isMd } = useBreakpoint();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openFam, setOpenFam] = useState<string | null>(null);

  // Couche 1 : sport du profil en tête s'il est hors des 8 (pousse la dernière carte).
  const profileEntry = findCatalogEntry(profileSport);
  const top = [...TOP_SPORTS];
  if (profileEntry && !top.includes(profileEntry.value)) { top.unshift(profileEntry.value); top.pop(); }
  const selected = catalogEntry(value);
  const selectedOutside = selected && !top.includes(selected.value);

  const hits = searchSports(query);
  const showSugg = fold(query).trim().length >= 2;

  function pick(v: string) { onSelect(v); setQuery(""); setSheetOpen(false); }
  function analyze() { const t = query.trim(); if (!t) return; onAnalyze(t); setQuery(""); }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {top.map(v => {
          const e = catalogEntry(v)!;
          return <button key={v} type="button" style={chip(value === v)} onClick={() => pick(v)}>{e.icon} {e.label}</button>;
        })}
        <button type="button" style={chip(false, true)} onClick={() => { setSheetOpen(true); setOpenFam(selected && GROUPED_FAMILIES[selected.fam] ? selected.fam : null); }}>+ Plus de sports</button>
      </div>

      {(selectedOutside || customLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "rgba(212,64,0,0.06)", border: "1px solid rgba(212,64,0,.22)", borderRadius: 12, padding: "9px 12px", fontSize: 13.5 }}>
          <span>✓</span>
          <b style={{ color: "#d44000" }}>{selectedOutside ? `${selected!.icon} ${entryLabel(selected!)}` : customLabel}</b>
          {!selectedOutside && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#8a8f94" }}>analysé par l&apos;IA</span>}
        </div>
      )}

      {/* Couche 2 : recherche. Suggestions en flux (pas en surcouche) : rien n'est rogné dans un
          tiroir qui défile. */}
      <div style={{ position: "relative", marginTop: 10 }}>
        <span style={{ position: "absolute", left: 12, top: 11, fontSize: 14, color: "#8a8f94" }}>🔍</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key !== "Enter" || !showSugg) return;
            e.preventDefault();
            if (hits.length) pick(hits[0].entry.value); else analyze();
          }}
          placeholder="Cherche ton sport (ex. hyrox, genou, kitesurf)"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 16, border: "1.5px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "10px 12px 10px 36px", fontFamily: "inherit", background: "#fff", outline: "none" }}
        />
      </div>
      {showSugg && (
        <div style={{ marginTop: 6, border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {hits.map(({ entry, hit }, k) => (
            <button key={entry.value} type="button" onClick={() => pick(entry.value)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, borderTop: k ? "1px solid rgba(0,0,0,.08)" : 0, background: "#fff", padding: "10px 12px", fontSize: 14, fontWeight: 600, color: "#171b1f", cursor: "pointer", fontFamily: "inherit" }}>
              <span>{entry.icon} {hit !== entry.label ? `${hit} → ${entryLabel(entry)}` : entryLabel(entry)}</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "#8a8f94", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{entry.fam}</span>
            </button>
          ))}
          <button type="button" onClick={analyze} disabled={analyzing}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, borderTop: hits.length ? "1px solid rgba(0,0,0,.08)" : 0, background: "#fff", padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "#d44000", cursor: "pointer", fontFamily: "inherit" }}>
            <span>✨ Analyser « {query.trim()} » avec l&apos;IA</span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "#8a8f94", textTransform: "uppercase" }}>{hits.length ? "autre" : "aucun résultat"}</span>
          </button>
        </div>
      )}
      {analyzing && <p style={{ fontSize: 12, color: "#8a8f94", marginTop: 6 }}>Analyse de ton sport…</p>}
      {analysisFailed && !analyzing && <p style={{ fontSize: 11.5, color: "#c81e1e", marginTop: 6 }}>Analyse indisponible : contenu générique utilisé à la place.</p>}

      {/* Couche 3 : catalogue complet par famille. */}
      {sheetOpen && (
        <div onClick={() => setSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483300, background: "rgba(7,10,13,.4)", display: "flex", alignItems: isMd ? "center" : "flex-end", justifyContent: "center", padding: isMd ? 24 : 0 }}>
          <div role="dialog" aria-label="Tous les sports" onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 560, maxHeight: isMd ? "80dvh" : "82dvh", background: "#fff", borderRadius: isMd ? 24 : "24px 24px 0 0", boxShadow: isMd ? "0 42px 120px rgba(0,0,0,.34)" : undefined, display: "flex", flexDirection: "column", animation: isMd ? "modalIn .2s ease-out" : "sheetInUp .22s ease-out", paddingBottom: isMd ? 0 : "env(safe-area-inset-bottom, 0px)" }}>
            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid rgba(0,0,0,.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Tous les sports</b>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: 999, border: 0, background: "#f4f3f1", cursor: "pointer", color: "#5f656b" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "4px 20px 20px" }}>
              {SPORT_FAMILIES.map(fam => {
                const items = SPORT_CATALOG.filter(s => s.fam === fam);
                const group = GROUPED_FAMILIES[fam];
                return (
                  <div key={fam} style={{ marginTop: 16 }}>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 8 }}>{fam}</div>
                    {group ? (
                      <>
                        <button type="button" style={chip(items.some(i => i.value === value))} onClick={() => setOpenFam(openFam === fam ? null : fam)}>
                          {group.icon} {fam} {openFam === fam ? "▴" : "▾"}
                        </button>
                        {openFam === fam && (
                          <div style={{ marginTop: 8, padding: 10, borderRadius: 12, background: "#f4f3f1" }}>
                            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 8 }}>{group.sub}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {items.map(s => <button key={s.value} type="button" style={chip(value === s.value)} onClick={() => pick(s.value)}>{s.icon} {s.label}</button>)}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {items.map(s => <button key={s.value} type="button" style={chip(value === s.value)} onClick={() => pick(s.value)}>{s.icon} {s.label}</button>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
