"use client";

import { useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import type { ProgramTemplate, SessionTemplate } from "@/types";
import { SPORT_CATEGORIES, guessSportChip, WEAKNESSES_BY_SPORT } from "@/lib/sportCategories";
import { getSessionTemplates } from "@/lib/sessionTemplates";

/* Créer une séance en 30 secondes (2026-10-02, POC seance-live section « Créer une séance ») :
   au-dessus de l'éditeur vide, 3 raccourcis qui REMPLISSENT la séance, sans 2e éditeur — le résultat
   atterrit dans l'éditeur normal (nom, exercices, difficulté), tout reste modifiable.
   - Modèle : les séances des programmes de la bibliothèque officielle (/api/programs/library).
   - Importer : texte ou photo, même import que les programmes (/api/programs/import).
   - Générer : la banque de séances du générateur (getSessionTemplates), par sport et intensité. */

export type QuickMode = "model" | "import" | "generate";
export type QuickFillResult = { name: string; notes: string; target_difficulty: number; source: QuickMode };

const LABEL: Record<QuickMode, { icon: string; short: string }> = {
  model: { icon: "📚", short: "Modèle" },
  import: { icon: "📷", short: "Importer" },
  generate: { icon: "✨", short: "Générer" },
};

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const m = (reader.result as string).match(/^data:([^;]+);base64,(.*)$/);
      if (!m) { reject(new Error("Fichier illisible")); return; }
      resolve({ mediaType: m[1], data: m[2] });
    };
    reader.onerror = () => reject(new Error("Fichier illisible"));
    reader.readAsDataURL(file);
  });
}

function sessionsOfFirstWeek(t: ProgramTemplate | null | undefined): SessionTemplate[] {
  const w = t?.weeks?.[0];
  if (!w) return [];
  return ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].flatMap(d => w[d] ?? []).filter(s => (s.notes ?? "").trim());
}

const chip = (on: boolean): React.CSSProperties => ({
  fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
  border: on ? "1px solid #d44000" : "1px solid rgba(0,0,0,.12)", background: on ? "rgba(212,64,0,.07)" : "#fff",
  color: on ? "#d44000" : "#30363b",
});
const label: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
  textTransform: "uppercase", color: "#8a8f94", margin: "4px 0 8px",
};
const primary: React.CSSProperties = {
  width: "100%", height: 46, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 14,
  fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.22)",
};
const rowBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", fontFamily: "inherit",
  background: "#fff", border: "1px solid rgba(0,0,0,.09)", borderRadius: 16, padding: "12px 14px", cursor: "pointer", color: "#171b1f",
};

export default function SessionQuickFill({ sport, initialMode, onFill }: {
  sport?: string | null;
  initialMode?: QuickMode;
  onFill: (r: QuickFillResult) => void;
}) {
  const [mode, setMode] = useState<QuickMode | null>(initialMode ?? null);
  const userChip = sport ? guessSportChip(sport) : null;

  function fill(r: QuickFillResult) {
    posthog.capture("session_quick_fill", { source: r.source });
    onFill(r);
  }

  const back = (
    <button onClick={() => setMode(null)} style={{ border: "none", background: "none", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 10 }}>
      ‹ Autres façons de créer
    </button>
  );

  if (mode === null) {
    /* Une seule ligne de 3 options compactes (2026-10-02, retour de Gildas : moins de bruit). */
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
        {(Object.keys(LABEL) as QuickMode[]).map(k => (
          <button key={k} onClick={() => { setMode(k); posthog.capture("session_quick_fill_opened", { source: k }); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", borderRadius: 12, border: "1px solid rgba(0,0,0,.09)", background: "#fff", cursor: "pointer", fontFamily: "inherit", color: "#171b1f" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{LABEL[k].icon}</span>
            <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{LABEL[k].short}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14, border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: 14, background: "#fafafa" }}>
      {back}
      {mode === "model" && <ModelPicker userChip={userChip} onPick={fill} />}
      {mode === "import" && <ImportSession onPick={fill} />}
      {mode === "generate" && <GenerateSession sport={sport ?? ""} onPick={fill} />}
    </div>
  );
}

function ModelPicker({ userChip, onPick }: { userChip: string | null; onPick: (r: QuickFillResult) => void }) {
  const [items, setItems] = useState<{ program: string; sportChip: string | null; s: SessionTemplate }[] | null>(null);
  const [filter, setFilter] = useState<string | null>(userChip);
  const [q, setQ] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/programs/library").then(r => r.json()).then(({ programs }) => {
      if (!alive) return;
      const seen = new Set<string>();
      const out: { program: string; sportChip: string | null; s: SessionTemplate }[] = [];
      for (const p of programs ?? []) {
        for (const s of sessionsOfFirstWeek(p.template)) {
          const key = `${s.name}|${s.notes}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ program: p.name, sportChip: guessSportChip(p.sport ?? ""), s });
        }
      }
      setItems(out);
    }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const chips = useMemo(() => {
    const present = new Set((items ?? []).map(i => i.sportChip).filter(Boolean) as string[]);
    return SPORT_CATEGORIES.filter(c => present.has(c.id));
  }, [items]);
  const list = (items ?? []).filter(i =>
    (!filter || i.sportChip === filter) &&
    (!q.trim() || `${i.s.name} ${i.program} ${i.s.notes}`.toLowerCase().includes(q.trim().toLowerCase())),
  ).slice(0, 40);

  if (!items) return <div style={{ fontSize: 13, color: "#8a8f94", padding: "12px 0" }}>Chargement des modèles…</div>;
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher : squat, fractionné, mobilité…"
        style={{ width: "100%", fontSize: 16, border: "1px solid rgba(0,0,0,.12)", borderRadius: 12, padding: "10px 12px", marginBottom: 10, fontFamily: "inherit", background: "#fff" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setFilter(null)} style={chip(filter === null)}>Tous</button>
        {chips.map(c => <button key={c.id} onClick={() => setFilter(c.id)} style={chip(filter === c.id)}>{c.icon} {c.id}</button>)}
      </div>
      <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
        {list.length === 0 && <div style={{ fontSize: 13, color: "#8a8f94" }}>Aucune séance ne correspond.</div>}
        {list.map((i, k) => {
          const lines = (i.s.notes ?? "").split("\n").filter(Boolean);
          return (
            <button key={k} onClick={() => onPick({ name: i.s.name, notes: lines.join("\n"), target_difficulty: i.s.target_difficulty, source: "model" })} style={{ ...rowBtn, display: "block" }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono), monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#8a8f94" }}>{i.program}</span>
              <span style={{ display: "block", fontSize: 14, fontWeight: 800, marginTop: 2 }}>{i.s.name}</span>
              <span style={{ display: "block", fontSize: 12, color: "#8a8f94", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lines.slice(0, 3).join(" · ")}{lines.length > 3 ? " · …" : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImportSession({ onPick }: { onPick: (r: QuickFillResult) => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<SessionTemplate[] | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try {
      const body: { text?: string; imageBase64?: string; imageMediaType?: string } = {};
      if (file) { const { data, mediaType } = await fileToBase64(file); body.imageBase64 = data; body.imageMediaType = mediaType; }
      else body.text = text;
      const res = await fetch("/api/programs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      const sessions = sessionsOfFirstWeek(data?.template);
      if (!data?.ok || !sessions.length) { setError(data?.error ?? "On n'a pas réussi à lire cette séance. Réessaie ou colle-la en texte."); return; }
      if (sessions.length === 1) pick(sessions[0]);
      else setChoices(sessions);
    } catch {
      setError("On n'a pas réussi à lire cette séance. Réessaie ou colle-la en texte.");
    } finally { setBusy(false); }
  }
  function pick(s: SessionTemplate) {
    onPick({ name: s.name, notes: (s.notes ?? "").split("\n").filter(Boolean).join("\n"), target_difficulty: s.target_difficulty, source: "import" });
  }

  if (choices) {
    return (
      <div>
        <div style={label}>{choices.length} séances trouvées : choisis celle du jour</div>
        <div style={{ display: "grid", gap: 8 }}>
          {choices.map((s, k) => (
            <button key={k} onClick={() => pick(s)} style={{ ...rowBtn, display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{s.name}</span>
              <span style={{ display: "block", fontSize: 12, color: "#8a8f94", marginTop: 2 }}>{(s.notes ?? "").split("\n").filter(Boolean).slice(0, 3).join(" · ")}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={label}>Colle ta séance</div>
      <textarea value={text} onChange={e => { setText(e.target.value); setFile(null); }} placeholder={"Ex :\nBack squat 4x6 80kg\nDéveloppé couché 4x8 60kg\nGainage 3x45s"}
        style={{ width: "100%", minHeight: 120, fontSize: 16, border: "1px solid rgba(0,0,0,.12)", borderRadius: 12, padding: 12, fontFamily: "inherit", resize: "vertical", background: "#fff" }} />
      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed rgba(212,64,0,.35)", borderRadius: 12, padding: 12, color: "#d44000", fontWeight: 800, fontSize: 13, marginTop: 8, cursor: "pointer", background: "#fff" }}>
        📷 {file ? file.name : "Ou prendre / choisir une photo"}
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setText(""); }} />
      </label>
      {error && <div style={{ fontSize: 12.5, color: "#b42318", marginTop: 8 }}>{error}</div>}
      <button onClick={run} disabled={busy || (!text.trim() && !file)} style={{ ...primary, marginTop: 12, opacity: busy || (!text.trim() && !file) ? 0.5 : 1 }}>
        {busy ? "Analyse en cours…" : "Analyser ma séance"}
      </button>
    </div>
  );
}

const DURATIONS = [{ k: "30 min", lines: 3 }, { k: "45 min", lines: 4 }, { k: "60 min", lines: 5 }, { k: "90 min", lines: 99 }];
const INTENSITIES = [{ k: "Légère", diff: 3 }, { k: "Modérée", diff: 6 }, { k: "Dure", diff: 8 }];

/* Générer (2026-10-02) : passe par le VRAI générateur de programmes (même moteur, même biais par
   point à travailler que les programmes) sur un seul jour et 4 semaines — chaque semaine donne une
   séance de difficulté différente (MEV → surcharge → MRV → décharge) et porte la ligne ciblant le
   point choisi. On garde celle dont la difficulté est la plus proche de l'intensité demandée. Repli
   sur la banque de séances si l'appel échoue. */
function GenerateSession({ sport, onPick }: { sport: string; onPick: (r: QuickFillResult) => void }) {
  const [sportId, setSportId] = useState<string | null>(guessSportChip(sport) ?? null);
  const [dur, setDur] = useState("45 min");
  const [intensity, setIntensity] = useState("Modérée");
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const options = WEAKNESSES_BY_SPORT[sportId ?? ""] ?? WEAKNESSES_BY_SPORT["Autre"] ?? [];

  function trim(notes: string, keepLast: boolean) {
    const lines = notes.split("\n").filter(Boolean);
    const max = DURATIONS.find(d => d.k === dur)!.lines;
    if (lines.length <= max) return lines;
    return keepLast ? [...lines.slice(0, max - 1), lines[lines.length - 1]] : lines.slice(0, max);
  }
  async function run() {
    const target = INTENSITIES.find(i => i.k === intensity)!.diff;
    setBusy(true);
    try {
      const res = await fetch("/api/programs/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: sportId ?? sport ?? "", level: "intermediaire", days: ["Mer"], duration: 4,
          focus: intensity === "Dure" ? "intensite" : intensity === "Légère" ? "volume" : "mixte",
          weaknesses,
        }),
      });
      const data = res.ok ? await res.json() : null;
      const all: SessionTemplate[] = (data?.template?.weeks ?? []).flatMap((w: Record<string, SessionTemplate[]>) => Object.values(w).flat())
        .filter((s: SessionTemplate) => (s.notes ?? "").trim() && s.type !== "test"); // jamais une séance de tests max
      if (all.length) {
        const best = [...all].sort((a, b) => Math.abs(a.target_difficulty - target) - Math.abs(b.target_difficulty - target))[0];
        onPick({ name: best.name, notes: trim(best.notes ?? "", weaknesses.length > 0).join("\n"), target_difficulty: target, source: "generate" });
        return;
      }
    } catch { /* repli ci-dessous */ } finally { setBusy(false); }
    const bank = getSessionTemplates(sportId ?? sport ?? "");
    const b = [...bank].sort((x, y) => Math.abs(x[2] - target) - Math.abs(y[2] - target))[0];
    onPick({ name: b[0], notes: trim(b[1], false).join("\n"), target_difficulty: target, source: "generate" });
  }
  return (
    <div>
      <div style={label}>Sport</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SPORT_CATEGORIES.map(c => <button key={c.id} onClick={() => { setSportId(c.id); setWeaknesses([]); }} style={chip(sportId === c.id)}>{c.icon} {c.id}</button>)}
      </div>
      <div style={label}>🎯 Points à travailler en priorité · 2 max</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {options.map(w => {
          const on = weaknesses.includes(w.key);
          return (
            <button key={w.key} style={chip(on)} onClick={() => setWeaknesses(prev => on ? prev.filter(k => k !== w.key) : prev.length >= 2 ? prev : [...prev, w.key])}>
              {on ? "✓ " : ""}{w.label}
            </button>
          );
        })}
      </div>
      <div style={label}>Durée</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {DURATIONS.map(d => <button key={d.k} onClick={() => setDur(d.k)} style={chip(dur === d.k)}>{d.k}</button>)}
      </div>
      <div style={label}>Intensité</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {INTENSITIES.map(i => <button key={i.k} onClick={() => setIntensity(i.k)} style={chip(intensity === i.k)}>{i.k}</button>)}
      </div>
      <button onClick={run} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Génération…" : "Générer ma séance"}</button>
    </div>
  );
}
