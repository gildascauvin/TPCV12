"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import posthog from "posthog-js";
import { useActivityStatus, refreshActivityStatusIfStale, type ActivityStatus, type ActivitySubject } from "@/lib/activityStatus";
import { OPEN_QUICKADD } from "@/lib/onboardingProgress";
import { COACH_ATHLETE_FILTER_EVENT, useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Pilule d'activité du header (2026-10-03, POC poc-element-activation-v5.html) : remplace le "+" et
   l'onglet Programmes de la nav. Analogie de l'objet connecté portée par le visuel seulement
   (pointillés = rien de prévu, anneau + illustration = actif), jamais par les mots.
   - Actif = au moins une séance prévue à venir, programme ou pas (même design dans les 2 cas).
   - Illustration : couverture du programme officiel, sinon emoji du sport (programme, puis profil).
   - Anneau : séances faites / prévues cette semaine.
   - Coach : vue "Tous" = équipe (sportifs actifs / total) ; sportif filtré = sa pilule. */

export const PILL_OPEN_KEY = "tpc_open_activity_pill";
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

/** `room` = largeur disponible à droite de la date centrée (mesurée par CalendarHeader). La pilule
    passe en version compacte quand la place manque, sans jamais passer sous la date. */
export default function ActivityPill({ room }: { room?: number | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const sandboxMatch = pathname.match(/^\/sandbox\/(athlete|coach)/);
  const basePath = sandboxMatch ? `/sandbox/${sandboxMatch[1]}` : undefined;
  const liveStatus = useActivityStatus(!basePath);
  // Sandbox : données d'exemple (même calcul que l'API), chargées seulement ici.
  const [sandboxStatus, setSandboxStatus] = useState<ActivityStatus | null>(null);
  const sandboxRole = sandboxMatch?.[1] as "athlete" | "coach" | undefined;
  useEffect(() => {
    if (!sandboxRole) return;
    let cancelled = false;
    import("@/lib/activitySandbox").then(m => { if (!cancelled) setSandboxStatus(m.sandboxActivityStatus(sandboxRole)); });
    return () => { cancelled = true; };
  }, [sandboxRole]);
  const status = basePath ? sandboxStatus : liveStatus;
  const role: "athlete" | "coach" = status?.role ?? (pathname.startsWith("/coach") || sandboxMatch?.[1] === "coach" ? "coach" : "athlete");
  const filterStorage = useCoachAthleteFilterStorage();
  const { isMd } = useBreakpoint();
  const [filterId, setFilterId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  // Changement de page : relu seulement si la dernière lecture date de plus de 30 s (les écritures
  // de séance déclenchent déjà un rafraîchissement immédiat via ONBOARDING_REFRESH).
  useEffect(() => { if (!basePath) refreshActivityStatusIfStale(30_000); }, [pathname, basePath]);
  useEffect(() => {
    const sync = () => setFilterId(filterStorage.read());
    sync();
    window.addEventListener(COACH_ATHLETE_FILTER_EVENT, sync);
    return () => window.removeEventListener(COACH_ATHLETE_FILTER_EVENT, sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Étape "Construis ton entraînement" de la checklist : ouvre ce tiroir (était le "+" de la nav).
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_QUICKADD, show);
    (window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill = ((window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill ?? 0) + 1;
    // Demande arrivée d'une page sans header (checklist sur /programmes…) : ouverte au montage.
    try { if (sessionStorage.getItem(PILL_OPEN_KEY) === "1") { sessionStorage.removeItem(PILL_OPEN_KEY); setOpen(true); } } catch { /* stockage indisponible */ }
    return () => {
      window.removeEventListener(OPEN_QUICKADD, show);
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

  // Badge complet partout (mobile compris) : version compacte sous 132 px de place, badge seul
  // seulement en dernier recours (moins de 72 px, ne devrait pas arriver).
  const badgeOnly = room != null && room < 72;
  const compact = room != null && room < 132;
  const badgeSize = compact ? 34 : 40;
  const pillStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: compact ? 6 : 8, height: compact ? 40 : 46, minWidth: 0, maxWidth: room != null ? Math.max(room, 40) : 140,
    padding: compact ? "0 9px 0 3px" : "0 12px 0 3px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", color: "#fff",
    background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)",
  };
  const titleStyle: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: compact ? 11 : 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const subStyle: React.CSSProperties = { fontSize: compact ? 9.5 : 10.5, fontWeight: 800, color: GREEN, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

  if (badgeOnly) { pillStyle.padding = 3; pillStyle.gap = 0; }
  let pill: React.ReactNode;
  if (isTeam) {
    pill = (
      <button onClick={toggle} aria-label="Activité de l'équipe" style={pillStyle}>
        <Badge size={badgeSize} team={team} />
        {!badgeOnly && (
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0, textAlign: "left" }}>
            <span style={titleStyle}>Équipe</span>
            <span style={subStyle}>{team.active}/{team.total} actifs</span>
          </span>
        )}
      </button>
    );
  } else if (focused?.active) {
    pill = (
      <button onClick={toggle} aria-label={focused.program?.name ?? "Séances prévues"} style={pillStyle}>
        <Badge size={badgeSize} subject={focused} />
        {!badgeOnly && (
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0, textAlign: "left" }}>
            <span style={titleStyle}>{focused.label}</span>
            <span style={subStyle}>{secondLine(focused)}</span>
          </span>
        )}
      </button>
    );
  } else {
    pill = (
      <button onClick={toggle} aria-label="Ajouter" style={{ ...pillStyle, background: "transparent", border: badgeOnly ? "none" : "1.5px dashed rgba(255,255,255,.38)", padding: badgeOnly ? 3 : "0 12px 0 5px" }}>
        <Badge size={compact ? 30 : 34} subject={null} />
        {!badgeOnly && <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Ajouter</span>}
      </button>
    );
  }

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
      {pill}
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
