"use client";

import { Children, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { categoryFor, type LibraryProgram } from "./ProgramLibraryBrowser";
import { SPORT_CATEGORIES, EXTRA_CATEGORIES, OTHER_CATEGORY, programSportEmoji } from "@/lib/sportCategories";
import { programCover } from "@/lib/programCovers";
import { sportShortLabel, DEFAULT_SHORT_LABEL } from "@/lib/sportShortLabel";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Page Programmes façon boutique (2026-10-03/04, POC poc-programme-header-v3.html) : création en
   premier, mes programmes, "Pour toi" (sport de l'utilisateur, masqué s'il est inconnu), puis tous
   les modèles. Aucun prix : les programmes restent un moyen gratuit.
   Perf : photos WordPress servies par next/image (redimensionnées, WebP/AVIF, chargées au fil du
   défilement) au lieu de l'original ~2 Mo en fond CSS ; liste des modèles sans leur contenu
   (chargé à la demande) et gardée en mémoire le temps de la session. */

export const SECTION_TITLE: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em",
};

export function SectionHeader({ title, sub, count }: { title: string; sub?: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={SECTION_TITLE}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: "#8a8f94", marginTop: 2 }}>{sub}</div>}
      </div>
      {count != null && (
        <div style={{ flexShrink: 0, fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, color: "#62686e", background: "#fff", border: "1px solid rgba(0,0,0,.08)", padding: "3px 9px", borderRadius: 999 }}>{count}</div>
      )}
    </div>
  );
}

/* Dégradé de repli pour un programme sans photo, teinté par famille de sport. */
const FAMILY_GRADIENT: Record<string, string> = {
  "Haltérophilie": "linear-gradient(150deg,#ff9a5a,#d44000 60%,#5a1600)",
  "Powerlifting": "linear-gradient(150deg,#ffb27a,#c2410c 60%,#431407)",
  "Musculation / Hypertrophie": "linear-gradient(150deg,#ff9fb8,#d43f6a 60%,#4f0f22)",
  "Fitness / CrossFit": "linear-gradient(150deg,#ffd76a,#e8a100 55%,#6b3d00)",
  "Athlétisme & vitesse": "linear-gradient(150deg,#7fd3ff,#1e7fc4 60%,#0b2a4a)",
  "Sports collectifs": "linear-gradient(150deg,#9ef0b5,#23a35a 60%,#0b3b22)",
  "Endurance": "linear-gradient(150deg,#a5d8ff,#3b82f6 60%,#172554)",
  "Arts martiaux & combat": "linear-gradient(150deg,#d6b3ff,#7a3fd4 60%,#2a0f55)",
};
function familyGradient(sport: string | null): string {
  return FAMILY_GRADIENT[categoryFor(sport).id] ?? "linear-gradient(150deg,#c9d2da,#5b6b78 60%,#1c242b)";
}

/** Visuel d'un programme : photo WordPress optimisée, sinon dégradé de la famille + emoji. */
export function Cover({ id, sport, sizes, emojiSize = 48, emojiAt = "top-right", priority, style, children }: {
  id: string | null; sport: string | null; sizes: string; emojiSize?: number; priority?: boolean;
  /** "bottom-left" quand le coin haut-droit porte déjà un bouton (Partager des cartes "Mes programmes"). */
  emojiAt?: "top-right" | "bottom-left";
  style?: React.CSSProperties; children?: React.ReactNode;
}) {
  const photo = id ? programCover(id) : null;
  return (
    <div style={{ position: "relative", overflow: "hidden", background: photo ? "#d9d6d0" : familyGradient(sport), ...style }}>
      {photo
        ? <Image src={photo} alt="" fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />
        : <span aria-hidden="true" style={{ position: "absolute", ...(emojiAt === "bottom-left" ? { bottom: "10%", left: 16 } : { top: "10%", right: "8%" }), fontSize: emojiSize, lineHeight: 1, zIndex: 1 }}>{programSportEmoji(sport)}</span>}
      {children}
    </div>
  );
}

/* Carrousel horizontal (2026-10-04) : cartes alignées sur les bords du contenu, flèches qui
   suggèrent le défilement (desktop) et points de position en dessous. */
export function Carousel({ itemWidth, gap = 14, children }: { itemWidth: string; gap?: number; children: React.ReactNode }) {
  const { isMd } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + gap : 1;
      setIndex(Math.min(items.length - 1, Math.round(el.scrollLeft / step)));
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [items.length, gap]);

  function go(dir: 1 | -1) {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first) el.scrollBy({ left: dir * (first.offsetWidth + gap), behavior: "smooth" });
  }
  function goTo(i: number) {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first) el.scrollTo({ left: i * (first.offsetWidth + gap), behavior: "smooth" });
  }

  const arrow = (dir: 1 | -1): React.CSSProperties => ({
    position: "absolute", top: "50%", [dir === 1 ? "right" : "left"]: isMd ? -18 : 6, transform: "translateY(-50%)", zIndex: 3,
    width: isMd ? 40 : 34, height: isMd ? 40 : 34, borderRadius: "50%", border: "1px solid rgba(0,0,0,.08)", cursor: "pointer",
    background: "rgba(255,255,255,.96)", boxShadow: "0 6px 18px rgba(0,0,0,.14)", color: "#171b1f", fontSize: 18, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={ref} style={{ display: "flex", gap, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" as const, padding: "2px 0 8px", alignItems: "stretch" }}>
          {items.map((child, i) => (
            <div key={i} style={{ flex: `0 0 ${itemWidth}`, scrollSnapAlign: "start", display: "flex" }}>{child}</div>
          ))}
        </div>
        {canPrev && isMd && <button aria-label="Précédent" onClick={() => go(-1)} style={arrow(-1)}>‹</button>}
        {canNext && <button aria-label="Suivant" onClick={() => go(1)} style={arrow(1)}>›</button>}
      </div>
      {items.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
          {items.map((_, i) => (
            <button key={i} aria-label={`Aller à ${i + 1}`} onClick={() => goTo(i)} style={{
              width: i === index ? 18 : 6, height: 6, borderRadius: 999, border: "none", padding: 0, cursor: "pointer",
              background: i === index ? "#171b1f" : "rgba(0,0,0,.18)", transition: "width .2s ease, background .2s ease",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Créer le sien : 3 tuiles ─── */
export function CreateTiles({ onGenerate, onImport, onBlank, dark = false }: { onGenerate: () => void; onImport: () => void; onBlank: () => void; dark?: boolean }) {
  const tiles = [
    { icon: "🎯", label: "Générer", sub: "Sport, objectif, jours", onClick: onGenerate },
    { icon: "📷", label: "Importer", sub: "Photo ou texte", onClick: onImport },
    { icon: "📄", label: "Programme vierge", sub: "Semaine vide", onClick: onBlank },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
      {tiles.map(t => (
        <button key={t.label} onClick={t.onClick} className="tpc-lift" style={{
          background: dark ? "rgba(255,255,255,.055)" : "#fff", border: `1px solid ${dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.08)"}`, borderRadius: 16, padding: "14px 8px",
          boxShadow: dark ? "none" : "0 2px 10px rgba(0,0,0,.03)", cursor: "pointer", textAlign: "center", fontFamily: "inherit",
        }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: dark ? "rgba(255,255,255,.08)" : "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, margin: "0 auto 8px" }}>{t.icon}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13.5, fontWeight: 700, color: dark ? "#fff" : "#171b1f", lineHeight: 1.2 }}>{t.label}</div>
          <div style={{ fontSize: 11, color: dark ? "rgba(255,255,255,.6)" : "#8a8f94", marginTop: 3, lineHeight: 1.25 }}>{t.sub}</div>
        </button>
      ))}
    </div>
  );
}

const metaChip: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, color: "#fff",
  background: "rgba(0,0,0,.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: "3px 8px", borderRadius: 999,
};

let libraryCache: Promise<LibraryProgram[]> | null = null;
function loadLibrary(): Promise<LibraryProgram[]> {
  if (!libraryCache) {
    libraryCache = fetch("/api/programs/library")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { programs: LibraryProgram[] }) => d.programs ?? []);
    libraryCache.catch(() => { libraryCache = null; });
  }
  return libraryCache;
}

/* ─── Modèles : "Pour toi" + tous les modèles ─── */
export function TemplateSections({ userSport, onSelect }: { userSport?: string | null; onSelect: (p: LibraryProgram) => void }) {
  const { isMd } = useBreakpoint();
  const [programs, setPrograms] = useState<LibraryProgram[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadLibrary().then(p => { if (!cancelled) setPrograms(p); }).catch(() => { if (!cancelled) setPrograms([]); });
    return () => { cancelled = true; };
  }, []);

  // "Pour toi" : même libellé de sport d'abord (ex. Muscu), sinon même famille. Rien si sport inconnu.
  const userLabel = sportShortLabel(userSport);
  const forYou = useMemo(() => {
    if (!programs || !userSport || userLabel === DEFAULT_SHORT_LABEL) return [];
    const same = programs.filter(p => sportShortLabel(p.sport) === userLabel);
    if (same.length >= 2) return same;
    const fam = categoryFor(userSport).id;
    if (fam === OTHER_CATEGORY.id) return same;
    const family = programs.filter(p => categoryFor(p.sport).id === fam && !same.includes(p));
    return [...same, ...family];
  }, [programs, userSport, userLabel]);

  const categories = useMemo(() => {
    if (!programs) return [];
    const present = new Map<string, { id: string; icon: string }>();
    programs.forEach(p => { const c = categoryFor(p.sport); present.set(c.id, c); });
    return [...SPORT_CATEGORIES, ...EXTRA_CATEGORIES, OTHER_CATEGORY].map(c => present.get(c.id)).filter((c): c is { id: string; icon: string } => !!c);
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

  if (!programs) return <TemplateSkeleton cols={isMd ? 4 : 2} />;
  if (programs.length === 0) return null;

  const chip = (active: boolean): React.CSSProperties => ({
    flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
    background: active ? "#171b1f" : "#fff", color: active ? "#fff" : "#3a3f45", border: `1px solid ${active ? "#171b1f" : "rgba(0,0,0,.08)"}`,
  });

  return (
    <>
      {forYou.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <SectionHeader title={`Pour toi · ${userLabel}`} sub="Des modèles construits pour ton sport" count={forYou.length} />
          <Carousel itemWidth={isMd ? "calc((100% - 28px) / 3)" : "82%"}>
            {forYou.map((p, i) => (
              <button key={p.id} onClick={() => onSelect(p)} className="tpc-lift" style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "none" }}>
                <Cover id={p.id} sport={p.sport} sizes="(min-width: 640px) 360px, 82vw" emojiSize={72} priority={i < 3} style={{ height: 240, borderRadius: 24 }}>
                  <span style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 35%, rgba(0,0,0,.8))" }} />
                  <span style={{ position: "absolute", left: 16, right: 16, bottom: 16, color: "#fff" }}>
                    <span style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                      <span style={metaChip}>{p.weeks_count} SEM.</span>
                      <span style={metaChip}>{p.sessions_per_week} J/SEM</span>
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{p.name}</span>
                  </span>
                </Cover>
              </button>
            ))}
          </Carousel>
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <SectionHeader title="Tous les modèles" sub="Construits par ThePerfClub, à ajuster à ta forme" count={programs.length} />
        <div style={{ height: 44, borderRadius: 999, background: "#fff", border: "1px solid rgba(0,0,0,.08)", display: "flex", alignItems: "center", gap: 8, padding: "0 16px", marginBottom: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8f94" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sport, objectif, compétition…"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 16, fontFamily: "inherit", color: "#171b1f" }} />
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 2, scrollbarWidth: "none" as const }}>
          <button onClick={() => setFilter(null)} style={chip(filter === null)}>Tous</button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setFilter(f => f === c.id ? null : c.id)} style={chip(filter === c.id)}>{c.icon} {c.id}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#8a8f94", fontSize: 13 }}>Aucun modèle ne correspond.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMd ? 4 : 2}, minmax(0, 1fr))`, gap: isMd ? 16 : 12 }}>
            {filtered.map(p => (
              <button key={p.id} onClick={() => onSelect(p)} className="tpc-lift" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <Cover id={p.id} sport={p.sport} sizes="(min-width: 640px) 260px, 46vw" style={{ aspectRatio: "4 / 3", borderRadius: 20, marginBottom: 8 }}>
                  <span style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 55%, rgba(0,0,0,.45))" }} />
                  <span style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 4 }}>
                    <span style={metaChip}>{p.weeks_count} SEM.</span>
                    <span style={metaChip}>{p.sessions_per_week} J/SEM</span>
                  </span>
                </Cover>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "#171b1f", lineHeight: 1.25 }}>{p.name}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#8a8f94", marginTop: 2 }}>{categoryFor(p.sport).icon} {categoryFor(p.sport).id}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* Squelette pendant le chargement des modèles (au lieu d'un simple "Chargement…"). */
function TemplateSkeleton({ cols }: { cols: number }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ width: 160, height: 18, borderRadius: 6, background: "rgba(0,0,0,.07)", marginBottom: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 }}>
        {Array.from({ length: cols * 2 }, (_, i) => (
          <div key={i}>
            <div className="tpc-skel-light" style={{ aspectRatio: "4 / 3", borderRadius: 20, marginBottom: 8 }} />
            <div className="tpc-skel-light" style={{ height: 12, width: "80%", borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
