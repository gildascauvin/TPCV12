"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import posthog from "posthog-js";
import {
  useActivityStatus, refreshActivityStatus, refreshActivityStatusIfStale, useDisplayedPeriod,
  type ActivityPeriod, type ActivityStatus, type ActivitySubject,
} from "@/lib/activityStatus";
import { createClient } from "@/lib/supabase/client";
import { OPEN_QUICKADD } from "@/lib/onboardingProgress";
import { COACH_ATHLETE_FILTER_EVENT, useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Bandeau d'activité (2026-10-04, POC poc-element-activation-v5.html v14) : pilule du header et
   bannière du Planning fusionnées en un bandeau pleine largeur, tout en haut de l'écran, identique
   sur toutes les pages. Analogie "autorégulation active / en pause sur le programme" portée par le
   voyant vert seulement, jamais par les mots.
   - Il décrit la PÉRIODE AFFICHÉE : le jour sur l'Accueil, la semaine sur le Planning (même règle
     partout, posée par CalendarHeader). Actif = une séance prévue à venir dans cette période ; une
     période passée est donc en pause.
   - Programme : nom + barres de charge des semaines (la semaine affichée cerclée).
   - Sans programme : thème de la semaine (modifiable) + 7 jours (faite / prévue / rien).
   - Actions en icône seule (✏️ / ↻ / +), le reste de la barre ouvre le tiroir ci-dessous.
   - Coach : le bandeau vit dans la barre des sportifs (AthleteFilterBar), pas dans le header. */

export const PILL_OPEN_KEY = "tpc_open_activity_pill";
/** Ouvre le tiroir depuis un bandeau rendu hors du header (barre des sportifs, côté coach). */
export const OPEN_ACTIVITY_DRAWER = "tpc:open-activity-drawer";
/** Reconduire la semaine affichée : la page qui sait le faire répond (`detail.handled = true`). */
export const ACTIVITY_RECONDUIRE = "tpc:activity-reconduire";
/** Thème de semaine modifié depuis le bandeau : les pages mettent à jour leur calendrier sans recharger. */
export const ACTIVITY_LABEL_CHANGED = "tpc:activity-label-changed";
const GREEN = "#3ddc84";

function sandboxHref(path: string, basePath?: string) {
  if (!basePath) return path;
  const [p, q] = path.split("?");
  const base = p === "/today" || p === "/coach" ? basePath : basePath + p.replace("/coach", "");
  return q ? `${base}?${q}` : base;
}

function nextLabel(date: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (date === today) return "aujourd'hui";
  if (date === format(addDays(new Date(), 1), "yyyy-MM-dd")) return "demain";
  return format(new Date(date + "T12:00:00"), "EEE d", { locale: fr });
}


function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* Illustration ronde : anneau + couverture/emoji (actif), "+" en pointillés (rien de prévu), compte
   de l'équipe (coach, vue Tous). */
/* Voyant vert qui respire : "actif" (au moins une séance prévue), programme ou pas. */
function Led({ size, light }: { size: number; light?: boolean }) {
  const d = Math.max(8, Math.round(size * 0.24));
  return (
    <span aria-hidden="true" style={{
      position: "absolute", right: -1, bottom: -1, width: d, height: d, borderRadius: "50%",
      background: GREEN, border: `2px solid ${light ? "#fff" : "#070a0d"}`, animation: "activityLed 1.8s ease-in-out infinite",
    }} />
  );
}

/* Illustration ronde : emoji du sport (actif), "+" en pointillés (rien de prévu),
   compte de l'équipe (coach, vue Tous). Voyant vert quand c'est actif. */
function Badge({ size, subject, team, light }: { size: number; subject?: ActivitySubject | null; team?: { active: number; total: number }; light?: boolean }) {
  const box: React.CSSProperties = { position: "relative", width: size, height: size, flexShrink: 0 };
  const round: React.CSSProperties = {
    position: "absolute", inset: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    border: `1px solid ${light ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.18)"}`,
  };
  if (team) {
    return (
      <span style={box}>
        <span style={{ ...round, background: light ? "#f1f0ee" : "rgba(255,255,255,.08)", fontFamily: "var(--font-mono), monospace", fontWeight: 800, fontSize: Math.round(size * 0.3), color: light ? "#171b1f" : "#fff" }}>
          {team.active}/{team.total}
        </span>
        {team.active > 0 && <Led size={size} light={light} />}
      </span>
    );
  }
  if (!subject?.active) {
    return (
      <span style={{ ...box, borderRadius: "50%", border: `1.5px dashed ${light ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.4)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PlusIcon size={Math.round(size * 0.5)} color={light ? "#8a8f94" : "rgba(255,255,255,.8)"} />
      </span>
    );
  }
  return (
    <span style={box}>
      <span style={{ ...round, fontSize: Math.round(size * 0.52) }}>{subject.emoji}</span>
      <Led size={size} light={light} />
    </span>
  );
}

function secondLine(s: ActivitySubject) {
  if (s.program) return `S${s.program.week}/${s.program.weeks}`;
  if (s.weekTotal) return `${s.weekDone}/${s.weekTotal} séances`;
  return s.next ? nextLabel(s.next.date) : "";
}

/* Même carte que les options de ProgramCreatePicker (tiroirs clairs de l'app). */
function SheetRow({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14,
        padding: 18, borderRadius: 16, border: "1px solid rgba(0,0,0,.08)",
        background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.03)",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 12, background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, color: "#171b1f" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "#171b1f", lineHeight: 1.25 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: "#8a8f94", marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ color: "#c7ccd1", fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  );
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

/* Données du bandeau : API en vrai, données d'exemple en sandbox (import dynamique). Partagé par
   le header (sportif) et la barre des sportifs (coach). */
export function useActivityData(period: ActivityPeriod, subject: string | null = null) {
  const pathname = usePathname() ?? "";
  const sandboxMatch = pathname.match(/^\/sandbox\/(athlete|coach)/);
  const sandboxRole = sandboxMatch?.[1] as "athlete" | "coach" | undefined;
  const basePath = sandboxRole ? `/sandbox/${sandboxRole}` : undefined;
  const live = useActivityStatus(!basePath, period, subject);
  const [sandboxStatus, setSandboxStatus] = useState<ActivityStatus | null>(null);
  useEffect(() => {
    if (!sandboxRole) return;
    let cancelled = false;
    import("@/lib/activitySandbox").then(m => { if (!cancelled) setSandboxStatus(m.sandboxActivityStatus(sandboxRole, period)); });
    return () => { cancelled = true; };
  }, [sandboxRole, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = basePath ? sandboxStatus : live.status;
  const loading = basePath ? !sandboxStatus : live.loading;
  const role: "athlete" | "coach" = status?.role ?? (pathname.startsWith("/coach") || sandboxRole === "coach" ? "coach" : "athlete");
  return { status, loading, role, basePath, pathname };
}

/** Fantôme du bandeau pendant le chargement d'une autre semaine (jamais l'ancienne affichée). */
export function ActivityStripSkeleton({ prefix }: { prefix?: React.ReactNode }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, width: "100%" }}>
      {prefix}
      <span className="tpc-skel" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
      <span className="tpc-skel" style={{ width: 140, height: 12, flexShrink: 1 }} />
      <span style={{ flex: 1 }} />
      <span className="tpc-skel" style={{ width: 54, height: 18, flexShrink: 0 }} />
    </div>
  );
}

function loadColor(avg: number): string {
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function IconBtn({ label, onClick, orange, children }: { label: string; onClick: () => void; orange?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0, cursor: "pointer", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
        fontSize: orange ? 18 : 14, fontWeight: 800, color: "#fff",
        background: orange ? "linear-gradient(180deg,#f04a08,#d44000)" : "transparent",
        border: orange ? "none" : "1px solid rgba(255,255,255,.2)",
      }}
    >
      {children}
    </button>
  );
}

/** Nom (thème) d'une semaine sans programme : profil du sportif, ou via la route coach. */
async function saveWeekLabel(o: { role: "athlete" | "coach"; athleteId?: string | null; monday: string; value: string | null; period: ActivityPeriod; basePath?: string }) {
  window.dispatchEvent(new CustomEvent(ACTIVITY_LABEL_CHANGED, { detail: { monday: o.monday, label: o.value, athleteId: o.athleteId ?? null } }));
  if (o.basePath) return;
  try {
    if (o.role === "coach" && o.athleteId) {
      await fetch("/api/coach/free-label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId: o.athleteId, monday: o.monday, label: o.value ?? "" }),
      });
    } else {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: row } = await supabase.from("profiles").select("free_training_label").eq("user_id", user.id).single();
      const next = { ...((row?.free_training_label as Record<string, string> | null) ?? {}) };
      if (o.value) next[o.monday] = o.value; else delete next[o.monday];
      const { error } = await supabase.from("profiles").update({ free_training_label: next }).eq("user_id", user.id);
      if (error) console.error("[activity] free_training_label update error:", error);
    }
  } finally {
    refreshActivityStatus(o.period, o.role === "coach" ? o.athleteId ?? null : null);
  }
}

/** Dans le tiroir : nommer la semaine affichée (séances sans programme). */
function WeekThemeRow({ subject, role, period, basePath }: { subject: ActivitySubject; role: "athlete" | "coach"; period: ActivityPeriod; basePath?: string }) {
  const [value, setValue] = useState(subject.freeLabel ?? "");
  useEffect(() => { setValue(subject.freeLabel ?? ""); }, [subject.freeLabel, subject.weekMonday]);
  const save = () => {
    const v = value.trim() || null;
    if ((v ?? "") === (subject.freeLabel ?? "")) return;
    posthog.capture("activity_strip_action", { role, action: "name_week" });
    saveWeekLabel({ role, athleteId: role === "coach" ? subject.id : null, monday: subject.weekMonday, value: v, period, basePath });
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8f94", marginBottom: 6 }}>Nom de la semaine</div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="Séances libres"
        style={{
          width: "100%", height: 46, borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", padding: "0 14px",
          fontSize: 16, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#171b1f", outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

/** Bandeau d'un sujet (sportif ou sportif sélectionné côté coach), sur la période affichée. */
export function ActivityStripBar({ subject, period, athleteId, who, prefix, onOpen, basePath, role }: {
  subject: ActivitySubject | null;
  period: ActivityPeriod;
  /** Côté coach : le sportif concerné (écriture du thème, liens). */
  athleteId?: string;
  /** Côté coach : prénom du sportif, affiché au-dessus du titre. */
  who?: string;
  /** Rendu avant le badge (bouton "‹ Groupe" côté coach). */
  prefix?: React.ReactNode;
  onOpen: () => void;
  basePath?: string;
  role: "athlete" | "coach";
}) {
  const router = useRouter();
  const { isMd } = useBreakpoint();
  const [labelOverride, setLabelOverride] = useState<{ monday: string; value: string | null } | null>(null);
  // Nom de semaine modifié dans le tiroir : affiché aussitôt, avant la relecture.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ monday: string; label: string | null; athleteId: string | null }>).detail;
      if (role === "coach" && d.athleteId !== athleteId) return;
      setLabelOverride({ monday: d.monday, value: d.label });
    };
    window.addEventListener(ACTIVITY_LABEL_CHANGED, on);
    return () => window.removeEventListener(ACTIVITY_LABEL_CHANGED, on);
  }, [role, athleteId]);

  const active = !!subject?.periodActive;
  const prog = subject?.periodProgram ?? null;
  const monday = subject?.weekMonday ?? period.from;
  const label = labelOverride && labelOverride.monday === monday ? labelOverride.value : subject?.freeLabel ?? null;
  const title = prog ? prog.name : (label || "Séances libres");
  const athleteQ = role === "coach" && athleteId ? `athlete=${athleteId}&` : "";
  const planningPath = role === "coach" ? "/coach/planning" : "/week";
  const go = (path: string, action: string) => {
    posthog.capture("activity_strip_action", { role, action, active, program: !!prog });
    router.push(sandboxHref(path, basePath));
  };
  // Jour affiché (Accueil) : cerclé dans la semaine.
  const dayIdx = period.from === period.to
    ? Math.round((new Date(period.from + "T12:00:00").getTime() - new Date(monday + "T12:00:00").getTime()) / 86400000)
    : -1;

  function reconduire() {
    const detail = { monday, athleteId: athleteId ?? null, handled: false };
    window.dispatchEvent(new CustomEvent(ACTIVITY_RECONDUIRE, { detail }));
    if (!detail.handled) go(`${planningPath}?${athleteQ}reconduire=${monday}`, "reconduire");
    else posthog.capture("activity_strip_action", { role, action: "reconduire", active, program: !!prog });
  }

  let viz: React.ReactNode = null;
  if (prog && prog.loads.length) {
    const max = Math.max(...prog.loads, 1);
    viz = (
      <span aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: isMd ? 3 : 2.5, height: 22, flexShrink: 0 }}>
        {prog.loads.map((v, i) => (
          <i key={i} style={{
            display: "block", width: isMd ? 6 : 5, borderRadius: 1.5,
            height: `${Math.max(22, Math.round((v / max) * 100))}%`,
            background: i < prog.week ? `${loadColor(v)}88` : i === prog.week ? loadColor(v) : "rgba(255,255,255,.2)",
            boxShadow: i === prog.week ? "0 0 0 1px #fff" : "none",
            filter: active ? "none" : "grayscale(1)", opacity: active ? 1 : 0.6,
          }} />
        ))}
      </span>
    );
  } else if (!prog && active) {
    const d = isMd ? 13 : 9;
    viz = (
      <span aria-hidden="true" style={{ display: "flex", gap: isMd ? 3 : 2.5, flexShrink: 0 }}>
        {(subject?.weekDays ?? []).map((st, i) => (
          <span key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <i style={{
              width: d, height: d, borderRadius: "50%", boxSizing: "border-box", fontStyle: "normal",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMd ? 8 : 0, color: "#fff",
              background: st === 2 ? "#2f9e44" : st === 1 ? "transparent" : "rgba(255,255,255,.14)",
              border: st === 1 ? "1.5px solid #ff8a55" : "none",
              outline: i === dayIdx ? "1.5px solid rgba(255,255,255,.85)" : "none", outlineOffset: 1,
            }}>{st === 2 ? "✓" : ""}</i>
            {isMd && <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.45)" }}>{DAY_LETTERS[i]}</span>}
          </span>
        ))}
      </span>
    );
  }

  let actions: React.ReactNode;
  if (prog) {
    // Le programme s'ouvre dans le tiroir (semaines, ajouter, voir le programme), pas de redirection.
    actions = <IconBtn label="Ouvrir" onClick={() => { posthog.capture("activity_strip_action", { role, action: "edit_program", active, program: true }); onOpen(); }}>✏️</IconBtn>;
  } else if (active) {
    actions = (
      <>
        <IconBtn label="Ouvrir" onClick={() => { posthog.capture("activity_strip_action", { role, action: "open", active, program: false }); onOpen(); }}>✏️</IconBtn>
        <IconBtn label="Reconduire la semaine" onClick={reconduire}>↻</IconBtn>
      </>
    );
  } else {
    // Même bouton que l'ancienne pilule "Ajouter" : ouvre le tiroir (séance ou programme).
    actions = (
      <button
        onClick={e => { e.stopPropagation(); posthog.capture("activity_strip_action", { role, action: "add", active, program: false }); onOpen(); }}
        style={{
          display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px 0 4px", flexShrink: 0,
          borderRadius: 999, background: "transparent", border: "1.5px dashed rgba(255,255,255,.38)",
          color: "#fff", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: "50%", border: "1.5px dashed rgba(255,255,255,.4)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <PlusIcon size={15} color="rgba(255,255,255,.8)" />
        </span>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Ajouter</span>
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter") onOpen(); }}
      className="activity-strip-bar"
      style={{
        display: "flex", alignItems: "center", gap: 10, minHeight: 48, width: "100%", cursor: "pointer", color: "#fff",
        borderRadius: 12, padding: "0 6px", margin: "0 -6px",
      }}
    >
      {prefix}
      <span style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          border: active ? "1px solid rgba(255,255,255,.18)" : "1.5px dashed rgba(255,255,255,.35)",
          fontSize: 18, filter: active ? "none" : "grayscale(1)", opacity: active ? 1 : 0.7,
        }}>{subject?.periodEmoji}</span>
        {active
          ? <Led size={34} />
          : <span aria-hidden="true" style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: "50%", background: "#5b6168", border: "2px solid #070a0d" }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
        {who && (
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who}</span>
        )}
          <span style={{
            display: "flex", alignItems: "center", gap: 5, minWidth: 0,
            fontFamily: "var(--font-mono), monospace", fontSize: 12.5, fontWeight: 700,
          }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          </span>
      </span>
      {viz}
      {actions}
    </div>
  );
}

/** Bande pleine largeur (fond + filet) autour d'un bandeau. */
export function ActivityStripBand({ active, contentMaxWidth, children }: { active: boolean; contentMaxWidth?: number; children: React.ReactNode }) {
  return (
    <div style={{
      background: active ? "rgba(255,255,255,.06)" : "transparent",
      borderBottom: active ? "1px solid rgba(255,255,255,.10)" : "1px dashed rgba(255,255,255,.22)",
    }}>
      <div style={{ maxWidth: contentMaxWidth, margin: contentMaxWidth ? "0 auto" : undefined, padding: "0 16px" }}>
        {children}
      </div>
    </div>
  );
}

/** Header : bandeau du sportif + tiroir (toujours monté, aussi côté coach, pour la checklist). */
export default function ActivityPill({ contentMaxWidth }: { contentMaxWidth?: number }) {
  const router = useRouter();
  const period = useDisplayedPeriod();
  const filterStorage = useCoachAthleteFilterStorage();
  const [filterId, setFilterId] = useState<string | null>(null);
  // Côté coach, même entrée de cache que la barre des sportifs (sujet = sportif sélectionné).
  const pn = usePathname() ?? "";
  const coachPath = pn.startsWith("/coach") || pn.startsWith("/sandbox/coach");
  const { status, loading, role, basePath, pathname } = useActivityData(period, coachPath ? filterId : null);
  const { isMd } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  // Changement de page : relu seulement si la dernière lecture date de plus de 30 s (les écritures
  // de séance déclenchent déjà un rafraîchissement immédiat via ONBOARDING_REFRESH).
  useEffect(() => { if (!basePath) refreshActivityStatusIfStale(30_000, period, role === "coach" ? filterId : null); }, [pathname, basePath]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sync = () => setFilterId(filterStorage.read());
    sync();
    window.addEventListener(COACH_ATHLETE_FILTER_EVENT, sync);
    return () => window.removeEventListener(COACH_ATHLETE_FILTER_EVENT, sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Étape "Construis ton entraînement" de la checklist et bandeau coach : ouvrent ce tiroir.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_QUICKADD, show);
    window.addEventListener(OPEN_ACTIVITY_DRAWER, show);
    (window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill = ((window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill ?? 0) + 1;
    // Demande arrivée d'une page sans header (checklist sur /programmes…) : ouverte au montage.
    try { if (sessionStorage.getItem(PILL_OPEN_KEY) === "1") { sessionStorage.removeItem(PILL_OPEN_KEY); setOpen(true); } } catch { /* stockage indisponible */ }
    return () => {
      window.removeEventListener(OPEN_QUICKADD, show);
      window.removeEventListener(OPEN_ACTIVITY_DRAWER, show);
      (window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill = Math.max(0, ((window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill ?? 1) - 1);
    };
  }, []);

  const athletes = status?.athletes ?? [];
  const focused: ActivitySubject | null = role === "coach"
    ? (filterId ? athletes.find(a => a.id === filterId) ?? null : null)
    : status?.self ?? null;
  const isTeam = role === "coach" && !focused;
  const team = { active: athletes.filter(a => a.active).length, total: athletes.length };
  const state = isTeam ? "team" : focused?.active ? (focused.program ? "program" : "sessions") : "idle";

  function toggle() {
    if (!open) posthog.capture("activity_pill_opened", { role, state });
    setOpen(o => !o);
  }
  function go(action: string, path: string, athleteId?: string) {
    posthog.capture("activity_pill_action", { role, state, action });
    if (athleteId) filterStorage.write(athleteId);
    setOpen(false);
    router.push(sandboxHref(path, basePath));
  }

  const planningPath = role === "coach" ? "/coach/planning" : "/week";
  const programsPath = role === "coach" ? "/coach/programmes" : "/programmes";
  const athleteQ = role === "coach" && focused ? `athlete=${focused.id}&` : "";

  // Côté coach, le bandeau vit dans la barre des sportifs : le header ne garde que le tiroir.
  const strip = role !== "athlete" ? null : status?.self && !loading ? (
    <ActivityStripBand active={!!status.self.periodActive} contentMaxWidth={contentMaxWidth}>
      <ActivityStripBar subject={status.self} period={period} onOpen={toggle} basePath={basePath} role="athlete" />
    </ActivityStripBand>
  ) : loading ? (
    <ActivityStripBand active contentMaxWidth={contentMaxWidth}><ActivityStripSkeleton /></ActivityStripBand>
  ) : null;

  const who = role === "coach" && focused ? focused.name.split(" ")[0] : null;
  const planRow = (
    <SheetRow
      icon={<PlusIcon size={20} color="#171b1f" />}
      title="Ajouter une séance"
      sub={who ? `Pour ${who}, à la date de ton choix` : "À la date de ton choix"}
      onClick={() => go("plan_session", `${planningPath}?${athleteQ}quickadd=session`)}
    />
  );
  const programRow = (
    <SheetRow
      icon="📚"
      title={role === "coach" ? "Assigner un programme" : "Choisir un programme"}
      sub="Modèle, généré ou le tien"
      onClick={() => go("programs", programsPath)}
    />
  );
  // En-tête des tiroirs clairs (même gabarit que ProgramCreatePicker) : visuel optionnel, titre, sous-titre, ✕.
  const header = (title: string, sub: React.ReactNode, visual?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
      {visual}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>{sub}</div>
      </div>
      <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8a8f94", fontSize: 20, alignSelf: "flex-start" }}>✕</button>
    </div>
  );
  const rows = (children: React.ReactNode) => <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;

  let sheet: React.ReactNode = null;
  if (isTeam) {
    sheet = (
      <>
        {header("Ton équipe",
          team.total ? `${team.active} sportif${team.active > 1 ? "s" : ""} sur ${team.total} avec une séance prévue` : "Aucun sportif pour l'instant",
          <Badge size={52} team={team} light />)}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {athletes.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: "#fff", border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 2px 10px rgba(0,0,0,.03)" }}>
              <Badge size={40} subject={a} light />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "#171b1f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name || initials(a.name)}</div>
                <div style={{ fontSize: 12.5, color: "#8a8f94", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.active ? `${a.label} · ${secondLine(a)}${a.next ? ` · prochaine ${nextLabel(a.next.date)}` : ""}` : "Aucune séance prévue"}
                </div>
              </div>
              <button
                onClick={() => go(a.active ? "team_view_athlete" : "team_plan_athlete", a.active ? `/coach/planning?athlete=${a.id}` : `/coach/planning?athlete=${a.id}&quickadd=session`, a.id)}
                style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                  color: a.active ? "#171b1f" : "#fff", background: a.active ? "#f1f0ee" : "linear-gradient(180deg,#f04a08,#d44000)", border: "none",
                }}
              >
                {a.active ? "Voir" : "Ajouter"}
              </button>
            </div>
          ))}
        </div>
        {rows(<>
          <SheetRow icon="👥" title="Inviter un sportif" sub="Lien, WhatsApp ou email" onClick={() => go("invite", "/coach/athletes?quickadd=invite")} />
          {programRow}
        </>)}
      </>
    );
  } else if (!focused?.active) {
    sheet = (
      <>
        {header("Ajouter", who ? `Une séance prévue pour ${who} s'ajuste à sa forme du jour` : "Une séance prévue s'ajuste à ta forme du jour")}
        {focused && !focused.periodProgram && <WeekThemeRow subject={focused} role={role} period={period} basePath={basePath} />}
        {rows(<>{planRow}{programRow}</>)}
      </>
    );
  } else {
    const s = focused;
    const title = s.program?.name ?? (s.label === "Séances" ? "Séances prévues" : `${s.label} · séances prévues`);
    sheet = (
      <>
        {header(`${title}${who ? ` · ${who}` : ""}`,
          <>
            <span style={{ color: "#2f9e44", fontWeight: 700 }}>{s.weekDone} faite{s.weekDone > 1 ? "s" : ""}, {s.weekTotal - s.weekDone} prévue{s.weekTotal - s.weekDone > 1 ? "s" : ""} cette semaine</span>
            {s.next && <> · prochaine : {nextLabel(s.next.date)}, {s.next.name}</>}
          </>,
          <Badge size={52} subject={s} light />)}
        {!s.periodProgram && <WeekThemeRow subject={s} role={role} period={period} basePath={basePath} />}
        {s.program && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: s.program.weeks }, (_, i) => (
                <span key={i} style={{
                  flex: 1, height: 8, borderRadius: 4,
                  background: i < s.program!.week - 1 ? "#2f9e44" : i === s.program!.week - 1 ? "#d44000" : "#e7e4df",
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8f94", marginTop: 6, fontFamily: "var(--font-mono), monospace" }}>SEMAINE {s.program.week} SUR {s.program.weeks}</div>
          </div>
        )}
        {rows(<>
          {planRow}
          <SheetRow icon="📅" title="Voir le planning" sub="Toutes tes séances de la semaine" onClick={() => go("view_planning", role === "coach" ? `/coach/planning?athlete=${s.id}` : "/week")} />
          {s.program
            ? <SheetRow icon="✏️" title="Voir le programme" sub="Modifier, changer ou arrêter" onClick={() => go("view_program", `${programsPath}?focus=${s.program!.id}`)} />
            : programRow}
        </>)}
      </>
    );
  }

  return (
    <>
      {strip}
      {/* Drawer (2026-10-03, retour de Gildas : le bottom sheet était le seul de l'app) : même
          convention que les autres tiroirs — docké à droite en desktop, plein écran en mobile. */}
      {mounted && open && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "stretch",
            justifyContent: isMd ? "flex-end" : "stretch", overflow: "hidden",
            background: "rgba(0,0,0,.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <div style={{
            background: "#fff",
            boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
            borderRadius: isMd ? "24px 0 0 24px" : 0,
            width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%", height: "100dvh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
          }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "calc(28px + env(safe-area-inset-top,0px)) 28px calc(28px + env(safe-area-inset-bottom,0px))" }}>
              {sheet}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
