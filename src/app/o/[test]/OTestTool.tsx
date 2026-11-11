"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import posthog from "posthog-js";
import { O_TESTS, encodeOValues } from "@/lib/oTests";
import { CMJ_NORMS, CMJ_SPORTS_WITHOUT_NORM } from "@/lib/cmjNorms";
import { TestLine, previewTestRow } from "@/components/tests/TestsPanel";
import { RETEST_DAYS } from "@/lib/testProfile";
import type { Sexe } from "@/lib/testNorms";

const INK = "#171b1f";
const SOFT = "#8a8f94";
const ACCENT = "#d44000";
const CARD: CSSProperties = { background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 6px 18px rgba(0,0,0,0.05)", padding: "16px 16px 18px", minWidth: 0 };

function num(v: string) { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; }
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Field({ id, label, value, unit, onChange }: { id: string; label: string; value: string; unit: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 700, color: INK }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: "1.5px solid rgba(0,0,0,.12)", borderRadius: 12, background: "#fff", padding: "0 12px" }}>
        <input
          id={id} inputMode="decimal" size={1} value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "12px 0", fontSize: 16, fontWeight: 700, color: INK, fontFamily: "var(--font-mono), monospace" }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: SOFT }}>{unit}</span>
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 4, padding: 4, borderRadius: 13, background: "#f1f0ee" }}>
      {options.map(o => {
        const pressed = value === o.value;
        return (
          <button
            key={o.value} type="button" aria-pressed={pressed} onClick={() => onChange(o.value)}
            style={{ flex: "1 1 0", minWidth: 0, padding: "10px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1.2, whiteSpace: "normal", background: pressed ? "#fff" : "transparent", color: pressed ? INK : SOFT, boxShadow: pressed ? "0 1px 4px rgba(0,0,0,.12)" : "none" }}
          >
            {pressed && <span aria-hidden style={{ color: ACCENT, marginRight: 5 }}>✓</span>}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OTestTool({ testKey }: { testKey: string }) {
  const def = O_TESTS[testKey];
  const [mode, setMode] = useState(def.modes?.[0].id ?? "");
  const [choice, setChoice] = useState(def.choice?.options[0].value ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const m of def.modes?.map(x => x.id) ?? [""]) for (const f of def.fields(m)) out[f.id] = f.def;
    return out;
  });
  const [sport, setSport] = useState("");
  const [sexe, setSexe] = useState<Sexe>(null);
  const [poids, setPoids] = useState("75");
  const [isEmbedded, setIsEmbedded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  /* Hauteur automatique (10/11) : dans une iframe, la page parente (WordPress) ajuste la hauteur de
     l'iframe à chaque changement (détail déplié, sexe, sport…) : plus de défilement interne. */
  useEffect(() => {
    const el = contentRef.current;
    if (!isEmbedded || !el || typeof ResizeObserver === "undefined") return;
    let last = 0;
    const post = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      window.parent.postMessage({ type: "tpc-o-height", test: testKey, h }, "*");
    };
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, [isEmbedded, testKey]);
  const [dates, setDates] = useState<{ today: string; next: string } | null>(null);
  const [utm, setUtm] = useState(`utm_source=seo&utm_medium=iframe&utm_campaign=${def.wpPath.replace(/^\/|\/$/g, "")}`);

  useEffect(() => {
    let embedded = false;
    try { embedded = window.self !== window.top; } catch { embedded = true; }
    setIsEmbedded(embedded);
    const now = new Date();
    const next = new Date(now); next.setDate(next.getDate() + RETEST_DAYS);
    setDates({ today: isoDate(now), next: isoDate(next) });
    /* UTM d'origine (lien ou iframe WordPress) reportés vers l'inscription, sinon ceux de l'outil. */
    const q = new URLSearchParams();
    new URLSearchParams(window.location.search).forEach((v, k) => { if (k.startsWith("utm_")) q.set(k, v); });
    if (q.toString()) setUtm(q.toString());
    posthog.capture("tool_page_viewed", { tool: testKey, is_embedded: embedded });
  }, [testKey]);

  const fields = def.fields(mode);
  const numeric = useMemo(() => Object.fromEntries(fields.map(f => [f.id, num(vals[f.id] ?? "")])), [fields, vals]);
  const values = def.compute(numeric, { mode, choice });
  const metric = def.metric(choice, values);
  const detail = def.detail?.(numeric, { mode, choice }) ?? null;
  const poidsKg = def.ask.poids && num(poids) > 0 ? num(poids) : null;
  // Barème par sexe (détente, 1RM, VO2max) : pas de jauge tant que Homme / Femme n'est pas choisi.
  const needsSexe = !!def.ask.sexe && !sexe;
  const row = values && metric && dates
    ? previewTestRow({ metric, values, sport: sport || null, sexe, poidsKg, dateIso: dates.today, nextIso: dates.next, withReference: !needsSexe })
    : null;

  // Ce qui s'enregistre à l'inscription : `persist` quand l'affichage contient une estimation (FC max).
  const saved = values && metric ? (def.persist ? def.persist(numeric, { mode, choice }) : values) : null;
  const hasSaved = !!saved && Object.keys(saved).length > 0;
  const ctaParams = new URLSearchParams();
  if (values && metric) {
    ctaParams.set("test", testKey);
    ctaParams.set("v", String(values[metric] ?? ""));
    if (hasSaved) ctaParams.set("x", encodeOValues(saved!));
    if (sexe) ctaParams.set("sx", sexe === "femme" ? "f" : "h");
    if (poidsKg) ctaParams.set("kg", String(poidsKg));
  }
  const ctaHref = `/register?${ctaParams.toString()}&${utm}`;

  const form = (
    <section style={CARD}>
      <div style={{ display: "grid", gap: 12 }}>
        {def.modes && <Seg label="Méthode de mesure" value={mode} options={def.modes.map(m => ({ value: m.id, label: m.label }))} onChange={to => { if (def.onModeChange && to !== mode) setVals(v => def.onModeChange!(v, to)); setMode(to); }} />}
        {def.choice && <Seg label={def.choice.label} value={choice} options={def.choice.options} onChange={setChoice} />}
        {def.grid && (
          <div role="group" aria-label="Tes sauts" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            {def.grid(mode).map(h => <div key={h} style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>{h}</div>)}
            {fields.map(f => (
              <input
                key={`${mode}-${f.id}`} id={`o-${f.id}`} aria-label={`${f.label} (${f.unit})`} inputMode="decimal" size={1}
                value={vals[f.id] ?? ""} onChange={e => setVals(s => ({ ...s, [f.id]: e.target.value }))}
                style={{ minWidth: 0, border: "1.5px solid rgba(0,0,0,.12)", borderRadius: 10, padding: "9px 8px", fontSize: 16, fontWeight: 700, color: INK, fontFamily: "var(--font-mono), monospace", background: "#fff" }}
              />
            ))}
          </div>
        )}
        <div style={{ display: def.grid ? "none" : "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
          {!def.grid && fields.map(f => f.options ? (
            <div key={`${mode}-${f.id}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, gridColumn: "1 / -1" }}>
              <label htmlFor={`o-${f.id}`} style={{ fontSize: 13, fontWeight: 700, color: INK }}>{f.label}</label>
              <select
                id={`o-${f.id}`} value={vals[f.id] ?? f.def} onChange={e => setVals(s => ({ ...s, [f.id]: e.target.value }))}
                style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 15, fontWeight: 600, color: INK }}
              >
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ) : (
            <Field key={`${mode}-${f.id}`} id={`o-${f.id}`} label={f.label} unit={f.unit} value={vals[f.id] ?? ""} onChange={v => setVals(s => ({ ...s, [f.id]: v }))} />
          ))}
          {def.ask.poids && <Field id="o-kg" label="Poids de corps" unit="kg" value={poids} onChange={setPoids} />}
        </div>
        {def.ask.sport && (
          <select
            aria-label="Ton sport" value={sport}
            onChange={e => { setSport(e.target.value); posthog.capture("tool_sport_selected", { tool: testKey, sport: e.target.value, is_embedded: isEmbedded }); }}
            style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 15, fontWeight: 600, color: sport ? INK : SOFT }}
          >
            <option value="">Ton sport</option>
            {CMJ_NORMS.map(x => <option key={x.sport} value={x.sport}>{x.sport}</option>)}
            <option disabled>──────────</option>
            {CMJ_SPORTS_WITHOUT_NORM.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        {def.ask.sexe && (
          <Seg label="Catégorie" value={sexe} options={[{ value: "homme", label: "Homme" }, { value: "femme", label: "Femme" }]} onChange={v => setSexe(v)} />
        )}
        <div style={{ fontSize: 12, color: SOFT, fontFamily: "var(--font-mono), monospace" }}>{def.formula(mode)}</div>
      </div>
    </section>
  );

  const result = (
    <section style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", borderRadius: 18, padding: "14px 16px 16px", color: "#fff", minWidth: 0 }}>
      {def.plain && detail?.big ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{detail.big.label}</div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", color: "#fff", marginTop: 4, lineHeight: 1.1 }}>{detail.big.value}</div>
          {detail.big.note && <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 4 }}>{detail.big.note}</div>}
        </div>
      ) : row ? (
        <>
          {/* Un seul point pour le visiteur : la ligne seule (valeur, jauge, badge, repère), sans historique ni courbe. */}
          <TestLine row={row} expanded={false} onToggle={() => {}} onQuickAdd={() => {}} bare hideDate hideNoReference={needsSexe || !!def.plain} />
          {needsSexe && <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.6)" }}>Choisis Homme ou Femme pour te situer.</div>}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", padding: "8px 0" }}>Entre ta mesure pour voir ton résultat.</div>
      )}
      {detail && (
        <details open style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,.10)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff" }}>{detail.summary}</summary>
          {detail.lines?.map(l => <div key={l} style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,.7)" }}>{l}</div>)}
          {detail.table && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", fontVariantNumeric: "tabular-nums" }}>
                <thead><tr>{detail.table.head.map(h => <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "rgba(255,255,255,.5)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {detail.table.rows.map((r, i) => (
                    <tr key={i} style={i === detail.table!.hl ? { background: "rgba(240,74,8,.18)" } : undefined}>
                      {r.map((c, j) => <td key={j} style={{ padding: "5px 8px", color: "#fff", whiteSpace: "nowrap", borderTop: "1px solid rgba(255,255,255,.06)" }}>{j === 0 && i === detail.table!.hl ? "● " : ""}{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
      {values && metric ? (
        <a
          href={ctaHref} target="_top"
          onClick={() => posthog.capture("tool_cta_clicked", { tool: testKey, metric, value: values[metric] ?? null, sport: sport || null, sexe, is_embedded: isEmbedded })}
          style={{ display: "block", marginTop: 14, textAlign: "center", padding: "14px 20px", borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none" }}
        >
          {def.cta}
        </a>
      ) : (
        <span aria-disabled style={{ display: "block", marginTop: 14, textAlign: "center", padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)", fontWeight: 800, fontSize: 15 }}>
          {def.cta}
        </span>
      )}
      {(hasSaved || !values) && <div style={{ marginTop: 6, textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>Ton résultat est gardé, on te dit quoi travailler.</div>}
    </section>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", display: "flex", flexDirection: "column" }}>
      {!isEmbedded && (
        <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>{def.heading}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>ThePerfClub</div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>
        <div ref={contentRef} style={{ maxWidth: 1000, margin: "0 auto", padding: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
          {form}
          {result}
        </div>
      </div>
    </div>
  );
}
