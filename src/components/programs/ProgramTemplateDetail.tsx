"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchLibraryTemplate, type LibraryProgram } from "./ProgramLibraryBrowser";
import type { ProgramTemplate, SessionTemplate } from "@/types";
import { Cover } from "./ProgramStoreSections";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import DiffGauge from "@/components/calendar/DiffGauge";

/* Fiche d'un modèle de programme (2026-10-03, V2 de la page Programmes, POC
   poc-programme-header-v3.html) : comme une page produit — photo, ce que ça change, la
   périodisation réelle (difficulté moyenne de chaque semaine du modèle), une séance type, puis
   "Démarrer ce programme" (sportif) / "Assigner à des sportifs" (coach). "Personnaliser" ouvre
   l'éditeur, comme le clic sur un modèle avant cette fiche. Aucun prix : les programmes restent un
   moyen gratuit. Tout ce qui est affiché est lu dans le modèle lui-même, rien d'inventé. */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const LEVEL_LABELS: Record<string, string> = { debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", elite: "Élite" };

function loadBarColor(avg: number): string {
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

interface Props {
  program: LibraryProgram;
  role: "athlete" | "coach";
  onBack: () => void;
  /* Enregistre une copie dans la bibliothèque puis passe à l'assignation. */
  onStart: () => Promise<void>;
  onCustomize: () => void;
}

export default function ProgramTemplateDetail({ program: p, role, onBack, onStart, onCustomize }: Props) {
  const { isMd } = useBreakpoint();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Intro WordPress (60 Ko) et contenu du modèle chargés seulement à l'ouverture de la fiche (perf).
  const [intro, setIntro] = useState<string[]>([]);
  const [template, setTemplate] = useState<ProgramTemplate | null>(p.template ?? null);
  useEffect(() => {
    let cancelled = false;
    import("@/lib/programIntros").then(m => { if (!cancelled) setIntro(m.programIntro(p.id)); });
    if (!p.template) fetchLibraryTemplate(p.id).then(t => { if (!cancelled) setTemplate(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [p.id, p.template]);
  const coach = role === "coach";

  const weeks = useMemo(() => template?.weeks ?? [], [template]);
  const weekAvgs = useMemo(() => weeks.map(w => {
    const s = DAYS.flatMap(d => (w[d] ?? []) as SessionTemplate[]);
    return s.length ? s.reduce((t, x) => t + (x.target_difficulty ?? 5), 0) / s.length : 0;
  }), [weeks]);
  const totalSessions = useMemo(() => weeks.reduce((t, w) => t + DAYS.reduce((u, d) => u + (w[d]?.length ?? 0), 0), 0), [weeks]);
  // Séance type : la plus représentative de la semaine 1 = la plus dure (c'est elle qui montre le contenu).
  const sample = useMemo(() => {
    const w1 = weeks[0] ?? {};
    const all = DAYS.flatMap(d => (w1[d] ?? []).map(s => ({ day: d, s })));
    return all.sort((a, b) => (b.s.target_difficulty ?? 0) - (a.s.target_difficulty ?? 0))[0] ?? null;
  }, [weeks]);
  const trainingDays = useMemo(() => DAYS.filter(d => (weeks[0]?.[d]?.length ?? 0) > 0), [weeks]);
  const maxAvg = Math.max(...weekAvgs, 1);
  const level = p.level ? LEVEL_LABELS[p.level] : null;

  async function start() {
    setStarting(true); setError(null);
    try { await onStart(); }
    catch (e) { setError(e instanceof Error ? e.message : "Impossible de démarrer ce programme"); setStarting(false); }
  }

  function share() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${p.id}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const chip: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.2)", padding: "4px 9px", borderRadius: 999, backdropFilter: "blur(6px)" };
  const h2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em", margin: "26px 0 10px" };
  const features = coach ? [
    ["📈", "Les charges progressent toutes seules, semaine après semaine."],
    ["🔋", "Un sportif sans énergie ? Sa séance s'allège au lieu de le griller."],
    ["📅", "Son planning se remplit dès l'assignation, sur ses jours dispos."],
  ] : [
    ["📈", "Les charges progressent toutes seules, semaine après semaine."],
    ["🔋", "Un jour sans énergie ? La séance s'allège au lieu de te griller."],
    ["📅", "Ton planning se remplit dès le départ, sur tes jours dispos."],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: "#f1f0ee", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 130 }}>
        {/* Héros : photo WordPress du programme, sinon dégradé de la famille + emoji. */}
        <Cover id={p.id} sport={p.sport} sizes="(min-width: 760px) 760px, 100vw" emojiSize={120} priority style={{ height: isMd ? 360 : 300, borderRadius: isMd ? "0 0 28px 28px" : 0 }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(0,0,0,.25), transparent 30%, rgba(0,0,0,.78))" }} />
          <div style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top,0px))", left: 14, right: 14, display: "flex", justifyContent: "space-between" }}>
            <button onClick={onBack} aria-label="Retour" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: 18, cursor: "pointer" }}>←</button>
            <button onClick={share} style={{ height: 38, padding: "0 14px", borderRadius: 999, border: "none", background: copied ? "#d44000" : "rgba(0,0,0,.4)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {copied ? "✓ Lien copié" : "🔗 Partager"}
            </button>
          </div>
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 20 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={chip}>{p.weeks_count} SEMAINES</span>
              <span style={chip}>{p.sessions_per_week} J/SEM</span>
              {level && <span style={chip}>{level.toUpperCase()}</span>}
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: isMd ? 30 : 25, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>{p.name}</h1>
          </div>
        </Cover>

        <div style={{ padding: "18px 20px 0" }}>
          {/* Résumé chiffré, lu dans le modèle. */}
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11.5, fontWeight: 700, color: "#8a8f94", letterSpacing: ".02em", minHeight: 15 }}>
            {template && <>{totalSessions} SÉANCES</>}{template && trainingDays.length ? ` · ${trainingDays.join(" · ").toUpperCase()}` : ""}
          </div>
          {/* Intro reprise de la page WordPress, affichée en entier. */}
          {intro.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {intro.map((para, i) => (
                <p key={i} style={{ fontSize: 14, color: "#4a5057", lineHeight: 1.6, margin: i === 0 ? 0 : "10px 0 0" }}>{para}</p>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "#4a5057", lineHeight: 1.55, margin: "10px 0 0" }}>
              Chaque séance s'ajuste à {coach ? "la forme du sportif" : "ta forme"} du jour après le check-in.
            </p>
          )}

          <h2 style={h2}>{coach ? "Ce que ça change pour tes sportifs" : "Ce que ça change pour toi"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {features.map(([icon, text]) => (
              <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13.5, color: "#2b3036" }}>
                <span style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(212,64,0,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>

          {weeks.length > 1 && (
            <>
              <h2 style={h2}>La périodisation</h2>
              <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "14px 14px 10px" }}>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 76 }}>
                  {weekAvgs.map((v, i) => (
                    <div key={i} title={`S${i + 1} · difficulté moyenne ${v.toFixed(1)}/10`} style={{ flex: 1, height: `${Math.max(8, (v / maxAvg) * 100)}%`, borderRadius: "6px 6px 3px 3px", background: loadBarColor(v) }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {weekAvgs.map((_, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, color: "#8a8f94" }}>S{i + 1}</div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: "#8a8f94", marginTop: 8 }}>Difficulté moyenne prévue par semaine.</div>
              </div>
            </>
          )}

          {sample && (
            <>
              <h2 style={h2}>Une séance type</h2>
              <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "#171b1f" }}>{sample.s.name}</div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, color: "#8a8f94", flexShrink: 0 }}>S1 · {sample.day.toUpperCase()}</div>
                </div>
                <DiffGauge value={sample.s.target_difficulty} />
                {(sample.s.notes ?? "").split("\n").filter(Boolean).map((line, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#2b3036", padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,.06)", marginTop: i === 0 ? 10 : 0 }}>{line}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barre d'action fixe */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px calc(16px + env(safe-area-inset-bottom,0px))", background: "linear-gradient(transparent, #f1f0ee 28%)" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          {error && <div style={{ fontSize: 12.5, color: "#d44000", textAlign: "center", marginBottom: 8 }}>{error}</div>}
          <button onClick={start} disabled={starting} style={{
            width: "100%", height: 50, borderRadius: 12, border: "none", cursor: starting ? "default" : "pointer", fontFamily: "inherit",
            background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800,
            boxShadow: "0 8px 20px rgba(212,64,0,.22)", opacity: starting ? .7 : 1,
          }}>
            {starting ? "Préparation…" : coach ? "Assigner à des sportifs" : "Démarrer ce programme"}
          </button>
          <button onClick={onCustomize} disabled={starting} style={{ width: "100%", marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#62686e", fontFamily: "inherit" }}>
            Personnaliser avant de {coach ? "l'assigner" : "démarrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
