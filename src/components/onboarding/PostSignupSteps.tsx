"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import SportPicker from "@/components/programs/SportPicker";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";

/* Questions post-signup (2026-10-05, POC https://claude.ai/artifact/GBoj2wydy4kK8N8skjTAwW#v2ob).
   Analogie : l'app est livrée sans device, ces écrans sont l'achat/la configuration du device (le
   programme). Une question par écran, thème clair des écrans de l'onboarding, bandeau photo en tête
   (couverture d'un programme du sport choisi, comme l'en-tête d'une page programme), « Passer » sur
   chaque écran. Aucun état n'est tenu ici : tout vit dans OnboardingFlow, qui décide du parcours
   et de ce qui est écrit à la fin. */

export type ObHas = "import" | "generate" | "later" | null;
export type ObGoal = "volume" | "intensite" | "competition" | "mixte";

const ORANGE = "#d44000";
const INK = "#171b1f";
const MUTED = "#6b7177";
const LINE = "rgba(0,0,0,.10)";
const PAGE = "#f1f0ee";

export function QuestionShell({ index, total, cover, title, sub, onSkip, skipLabel = "Passer", onBack, cta, children, dark = false, eyebrow }: {
  index: number; total: number; cover: string;
  title: React.ReactNode; sub?: React.ReactNode;
  onSkip?: () => void; skipLabel?: string; onBack?: () => void;
  cta?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  children: React.ReactNode;
  /* Écran de valeur sans question (parcours Elite, 2026-10-17) : fond sombre de l'app, sans photo. */
  dark?: boolean;
  eyebrow?: string;
}) {
  const { isMd } = useBreakpoint();
  const col = isMd ? 560 : 520;
  const ink = dark ? "#fff" : INK;
  const muted = dark ? "rgba(255,255,255,.62)" : MUTED;
  const line = dark ? "rgba(255,255,255,.12)" : LINE;
  // En-tête (retour, compteur, Passer, frise) toujours sur fond uni : lisible quelle que soit la photo.
  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Retour" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${line}`, background: dark ? "rgba(255,255,255,.06)" : "#fff", color: ink, cursor: "pointer", fontSize: 16 }}>←</button>
        ) : <span style={{ width: 34 }} />}
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: muted }}>{index + 1} / {total}</span>
        {onSkip && (
          <button type="button" onClick={onSkip} style={{ marginLeft: "auto", border: 0, background: "transparent", color: muted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{skipLabel}</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${total}, 1fr)`, gap: 4 }}>
        {Array.from({ length: total }, (_, k) => (
          <i key={k} style={{ height: 4, borderRadius: 999, background: k <= index ? ORANGE : dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.10)" }} />
        ))}
      </div>
    </>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: dark ? DARK_CARD_BG : PAGE, overflowY: "auto", zIndex: 1 }}>
      {dark ? <div style={{ height: isMd ? 56 : 28 }} /> : (
        <>
          <div style={{ maxWidth: col, margin: "0 auto", padding: "calc(14px + env(safe-area-inset-top, 0px)) 20px 14px", color: ink }}>{header}</div>
          {/* Bandeau photo du sport choisi, sous l'en-tête, fondu vers la page en bas. */}
          <div style={{ position: "relative", height: isMd ? 200 : 120 }}>
            <Image src={cover} alt="" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "center 35%" }} />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(241,240,238,0) 55%, rgba(241,240,238,.7) 82%, ${PAGE} 100%)` }} />
          </div>
        </>
      )}
      <div style={{ position: "relative", maxWidth: col, margin: "0 auto", padding: dark ? "16px 20px 140px" : "8px 20px 140px", color: ink }}>
        {dark && <div style={{ marginBottom: 28 }}>{header}</div>}
        {eyebrow && <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: dark ? "#ff8a55" : ORANGE, marginBottom: 8 }}>{eyebrow}</div>}
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.2, margin: "0 0 8px", textWrap: "balance" as React.CSSProperties["textWrap"] }}>{title}</h1>
        {sub && <p style={{ fontSize: 15, color: muted, lineHeight: 1.5, margin: "0 0 22px" }}>{sub}</p>}
        {children}
      </div>
      {cta && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))", background: dark ? "#070a0d" : PAGE, borderTop: `1px solid ${line}` }}>
          <button type="button" onClick={cta.onClick} disabled={cta.disabled || cta.busy}
            style={{ display: "block", width: "100%", maxWidth: col - 40, margin: "0 auto", padding: "16px", borderRadius: 999, border: 0, background: cta.disabled ? (dark ? "rgba(255,255,255,.12)" : "#e8e4df") : ORANGE, color: cta.disabled ? (dark ? "rgba(255,255,255,.4)" : "#a3a8ad") : "#fff", fontWeight: 800, fontSize: 16, cursor: cta.disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: cta.busy ? .7 : 1 }}>
            {cta.busy ? "Un instant…" : cta.label}
          </button>
        </div>
      )}
    </div>
  );
}

/* Carte d'option : un clic = choix (et passage à l'écran suivant, décidé par le parent). */
export function OptionCard({ icon, label, hint, on, onClick }: { icon: React.ReactNode; label: string; hint?: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "16px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", color: INK,
        border: on ? `2px solid ${ORANGE}` : `1px solid ${LINE}`, background: on ? "rgba(212,64,0,.06)" : "#fff", marginBottom: 10 }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{label}</span>
        {hint && <span style={{ fontSize: 13, color: MUTED }}>{hint}</span>}
      </span>
    </button>
  );
}

export function ChoiceChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "10px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: on ? ORANGE : INK,
        border: on ? `2px solid ${ORANGE}` : `1px solid ${LINE}`, background: on ? "rgba(212,64,0,.06)" : "#fff" }}>
      {on ? "✓ " : ""}{children}
    </button>
  );
}

/* Étape Sport : le même SportPicker que les générateurs de l'app. */
export function SportStepBody(props: React.ComponentProps<typeof SportPicker>) {
  return <SportPicker {...props} />;
}

/* Étape Import : même import que l'app (/api/programs/import), texte ou photo. */
export function ImportStepBody({ text, onText, file, onFile, error }: {
  text: string; onText: (t: string) => void; file: File | null; onFile: (f: File | null) => void; error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <textarea value={text} onChange={e => { onText(e.target.value); onFile(null); }}
        placeholder={"Ex :\nLun : Back squat 5×5 @100kg, fentes 3×12\nMer : Run 6×800 m"}
        style={{ width: "100%", boxSizing: "border-box", minHeight: 150, fontSize: 16, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", color: INK, padding: 14, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 10, padding: 14, borderRadius: 16, border: "1px dashed rgba(212,64,0,.45)", background: "#fff", color: ORANGE, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
        📷 {file ? file.name : "Ou prends-le en photo"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0] ?? null; onFile(f); if (f) onText(""); }} />
      <p style={{ fontSize: 13, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>On reprend exactement ce que contient ton programme : une semaine ou plusieurs.</p>
      {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export const GOAL_OPTIONS: { value: ObGoal; icon: string; label: string; hint?: string }[] = [
  { value: "volume", icon: "📈", label: "Gagner en volume" },
  { value: "intensite", icon: "⚡", label: "Monter en intensité" },
  { value: "competition", icon: "🎯", label: "Préparer une échéance", hint: "Compétition, test, course" },
  { value: "mixte", icon: "⚖️", label: "Un peu de tout" },
];

export function DeadlineField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [min] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]);
  return (
    <label style={{ display: "block", margin: "2px 0 12px 0", padding: "12px 14px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff" }}>
      <span style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 6 }}>📅 Date de l&apos;échéance</span>
      <input type="date" value={value} min={min} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", fontSize: 16, background: "transparent", color: INK, border: 0, outline: "none", fontFamily: "inherit" }} />
    </label>
  );
}

export const WEEK_DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
