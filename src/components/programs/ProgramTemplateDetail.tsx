"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchLibraryTemplate, type LibraryProgram } from "./ProgramLibraryBrowser";
import type { ProgramTemplate } from "@/types";
import { Cover } from "./ProgramStoreSections";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Fiche d'un modèle de programme (2026-10-03, V2 de la page Programmes, POC
   poc-programme-header-v3.html) : comme une page produit — photo, ce que ça change, la
   périodisation réelle (difficulté moyenne de chaque semaine du modèle), une séance type, puis
   "Démarrer ce programme" (sportif) / "Assigner à des sportifs" (coach). "Personnaliser" ouvre
   l'éditeur, comme le clic sur un modèle avant cette fiche. Aucun prix : les programmes restent un
   moyen gratuit. Tout ce qui est affiché est lu dans le modèle lui-même, rien d'inventé. */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const LEVEL_LABELS: Record<string, string> = { debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", elite: "Élite" };


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
  // Hauteur du cadre /p/ : envoyée par la page insérée (voir PublicProgramView, ?inapp=1).
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; id?: string; height?: number };
      if (d?.type === "tpc-program-height" && d.id === p.id && typeof d.height === "number") setFrameHeight(Math.ceil(d.height) + 4);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [p.id]);

  const weeks = useMemo(() => template?.weeks ?? [], [template]);
  const totalSessions = useMemo(() => weeks.reduce((t, w) => t + DAYS.reduce((u, d) => u + (w[d]?.length ?? 0), 0), 0), [weeks]);
  const trainingDays = useMemo(() => DAYS.filter(d => (weeks[0]?.[d]?.length ?? 0) > 0), [weeks]);
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

          {/* Le bloc de /p/ inséré tel quel (2026-10-05, ?inapp=1 : sans sa barre du haut ni son CTA).
              Côté sportif, &lock=1 floute les exercices des semaines 2+ (programme pas encore démarré). */}
          {(
            <>
              <h2 style={h2}>Le programme</h2>
              {/* Plus large que la colonne en desktop (jusqu'à 1180 px, centré sur l'écran) ; hauteur
                  envoyée par /p/ (postMessage) pour ne jamais défiler dans le cadre. */}
              <iframe
                title={`Aperçu ${p.name}`}
                src={`/p/${p.id}?inapp=1${coach ? "" : "&lock=1"}`}
                scrolling="no"
                style={isMd
                  ? { display: "block", position: "relative", left: "50%", transform: "translateX(-50%)", width: "min(1180px, calc(100vw - 32px))", height: frameHeight ?? 700, border: 0, borderRadius: 16, background: "#f1f0ee" }
                  : { display: "block", width: "calc(100% + 40px)", margin: "0 -20px", height: frameHeight ?? 700, border: 0, background: "#f1f0ee" }}
              />
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
