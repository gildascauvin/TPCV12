"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import SportPicker from "@/components/programs/SportPicker";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";
import { catalogEntry, findCatalogEntry } from "@/lib/sportCatalog";

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

export function QuestionShell({ index, total, cover, title, sub, onSkip, skipLabel = "Passer", skipBottom = false, onBack, cta, children, dark = false, eyebrow }: {
  index: number; total: number; cover: string;
  title: React.ReactNode; sub?: React.ReactNode;
  onSkip?: () => void; skipLabel?: string; onBack?: () => void;
  /* « Plus tard » sous le bouton principal (écrans de permission : Apple Santé, notifications). */
  skipBottom?: boolean;
  /* store : bouton noir « Télécharger dans l'App Store » (web iPhone, comme le POC) ou « Disponible
     sur Google Play » (web Android, 2026-10-28). */
  cta?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; store?: "apple" | "google" };
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
  /* En-tête transparent posé en haut de la photo, comme le POC (2026-10-18) : le voile sombre du haut
     de la photo rend le compteur et « Passer » lisibles en blanc ; la question commence sur le fondu. */
  const onPhoto = !dark;
  const headInk = onPhoto ? "#fff" : muted;
  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Retour" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${line}`, background: dark ? "rgba(255,255,255,.06)" : "#fff", color: ink, cursor: "pointer", fontSize: 16 }}>←</button>
        ) : <span style={{ width: 34 }} />}
        {onSkip && !skipBottom && (
          <button type="button" onClick={onSkip} style={{ marginLeft: "auto", border: 0, background: "transparent", color: headInk, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{skipLabel}</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${total}, 1fr)`, gap: 4 }}>
        {Array.from({ length: total }, (_, k) => (
          <i key={k} style={{ height: 4, borderRadius: 999, background: k <= index ? ORANGE : onPhoto ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.14)" }} />
        ))}
      </div>
    </>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: dark ? DARK_CARD_BG : PAGE, overflowY: "auto", zIndex: 1 }}>
      {dark ? <div style={{ height: isMd ? 56 : 28 }} /> : (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: isMd ? 260 : 200 }}>
          <Image src={cover} alt="" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "center 35%" }} />
          {/* Fondu fini avant le titre : la question se lit toujours sur le fond uni de la page. */}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(7,10,13,.5) 0%, rgba(7,10,13,.4) 35%, rgba(60,58,56,.28) 52%, rgba(241,240,238,.7) 72%, rgba(241,240,238,.95) 86%, ${PAGE} 94%)` }} />
        </div>
      )}
      {!dark && (
        <div style={{ position: "relative", maxWidth: col, margin: "0 auto", padding: "calc(16px + env(safe-area-inset-top, 0px)) 20px 0" }}>{header}</div>
      )}
      <div style={{ position: "relative", maxWidth: col, margin: "0 auto", padding: dark ? `16px 20px ${skipBottom ? 180 : 140}px` : `${isMd ? 196 : 136}px 20px ${skipBottom ? 180 : 140}px`, color: ink }}>
        {dark && <div style={{ marginBottom: 28 }}>{header}</div>}
        {eyebrow && <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: dark ? "#ff8a55" : ORANGE, marginBottom: 8 }}>{eyebrow}</div>}
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.2, margin: "0 0 8px", textWrap: "balance" as React.CSSProperties["textWrap"] }}>{title}</h1>
        {sub && <p style={{ fontSize: 15, color: muted, lineHeight: 1.5, margin: "0 0 22px" }}>{sub}</p>}
        {children}
      </div>
      {cta && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))", background: dark ? "#070a0d" : PAGE, borderTop: `1px solid ${line}` }}>
          {cta.store ? (
            <button type="button" onClick={cta.onClick} aria-label={cta.label}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", maxWidth: col - 40, margin: "0 auto", padding: "11px 18px", borderRadius: 14, border: "1px solid #333", background: "#000", color: "#fff", cursor: "pointer", fontFamily: "-apple-system, system-ui, sans-serif" }}>
              {cta.store === "google" ? (
                <svg width="22" height="24" viewBox="0 0 24 26" aria-hidden="true"><path fill="#00d7fe" d="M1.2.6 13.5 12.9 1.2 25.2c-.4-.3-.7-.8-.7-1.4V2c0-.6.3-1.1.7-1.4z"/><path fill="#00f076" d="m17.6 8.8-4.1 4.1L1.2.6c.4-.3 1-.4 1.6-.1z"/><path fill="#ff3a44" d="M17.6 17 2.8 25.3c-.6.3-1.2.2-1.6-.1l12.3-12.3z"/><path fill="#ffd400" d="m22.4 11.5-4.8-2.7-4.1 4.1 4.1 4.1 4.8-2.7c1.4-.8 1.4-2 0-2.8z"/></svg>
              ) : (
              <svg width="22" height="26" viewBox="0 0 384 512" aria-hidden="true"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
              )}
              <span style={{ textAlign: "left", lineHeight: 1.1 }}>
                <small style={{ display: "block", fontSize: 11 }}>{cta.store === "google" ? "Disponible sur" : "Télécharger dans"}</small>
                <b style={{ display: "block", fontSize: 19, fontWeight: 600 }}>{cta.store === "google" ? "Google Play" : "l'App Store"}</b>
              </span>
            </button>
          ) : (
          <button type="button" onClick={cta.onClick} disabled={cta.disabled || cta.busy}
            style={{ display: "block", width: "100%", maxWidth: col - 40, margin: "0 auto", padding: "16px", borderRadius: 999, border: 0, background: cta.disabled ? (dark ? "rgba(255,255,255,.12)" : "#e8e4df") : ORANGE, color: cta.disabled ? (dark ? "rgba(255,255,255,.4)" : "#a3a8ad") : "#fff", fontWeight: 800, fontSize: 16, cursor: cta.disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: cta.busy ? .7 : 1 }}>
            {cta.busy ? "Un instant…" : cta.label}
          </button>
          )}
          {onSkip && skipBottom && (
            <button type="button" onClick={onSkip} disabled={cta.busy}
              style={{ display: "block", margin: "10px auto 0", border: 0, background: "transparent", color: muted, fontWeight: 600, fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit" }}>
              {skipLabel}
            </button>
          )}
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
  { value: "volume", icon: "📈", label: "Augmenter ma capacité de travail", hint: "Plus de volume, sans te griller" },
  { value: "intensite", icon: "⚡", label: "Monter en intensité", hint: "Des séances plus intenses" },
  { value: "competition", icon: "🎯", label: "Préparer une échéance", hint: "Compétition, test, course" },
  { value: "mixte", icon: "⚖️", label: "Un peu de tout" },
];

/* « Volume » = capacité de travail, « intensité » : dits dans les mots du sport (31/10, retours Gildas :
   « Gagner en volume » était ambigu ; « match » pour les sports collectifs, « combat » pour le combat).
   Famille lue dans le catalogue des sports ; sport hors catalogue : famille de sportFamily(). */
type GoalFamily = "force" | "endurance" | "collectif" | "combat" | "athle" | "mixte";
const GOAL_WORDS: Record<GoalFamily, Partial<Record<ObGoal, { label: string; hint: string }>>> = {
  force: { volume: { label: "Encaisser plus de travail", hint: "Plus de séries et de répétitions" }, intensite: { label: "Soulever plus lourd", hint: "Des charges plus proches de ton max" } },
  endurance: { volume: { label: "Tenir plus longtemps", hint: "Plus de kilomètres, des sorties plus longues" }, intensite: { label: "Aller plus vite", hint: "Fractionné, allure, VMA" } },
  collectif: { volume: { label: "Tenir tout le match", hint: "Répéter les efforts sans baisser" }, intensite: { label: "Être plus explosif", hint: "Sprints, sauts, changements de direction" } },
  combat: { volume: { label: "Tenir tout le combat", hint: "Garder ton rythme jusqu'au dernier round" }, intensite: { label: "Être plus explosif", hint: "Vitesse, puissance, explosivité" } },
  athle: { volume: { label: "Encaisser plus de travail", hint: "Plus de répétitions, sans te griller" }, intensite: { label: "Aller plus vite", hint: "Vitesse, explosivité, départs" } },
  mixte: {},
};
const FAM_TO_GOAL: Record<string, GoalFamily> = { Force: "force", Endurance: "endurance", "Sports collectifs": "collectif", Combat: "combat", "Athlétisme": "athle" };
export function goalOptionsFor(sport: string, fallback: "force" | "endurance" | "collectif" | "mixte") {
  const e = catalogEntry(sport) ?? findCatalogEntry(sport);
  const fam: GoalFamily = e ? (FAM_TO_GOAL[e.fam] ?? "mixte") : /combat|boxe|judo|mma|lutte|karat|jiu|kick|muay|taekwondo/i.test(sport) ? "combat" : fallback;
  return GOAL_OPTIONS.map(g => ({ ...g, ...(GOAL_WORDS[fam][g.value] ?? {}) }));
}

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
