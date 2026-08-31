"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import QuickAddSheet from "./QuickAddSheet";

const athleteTabs = [
  {
    href: "/today",
    label: "Aujourd'hui",
    icon: (active: boolean) => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.5H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z"/>
      </svg>
    ),
  },
  {
    href: "/week",
    label: "Planning",
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8V6.2A2.2 2.2 0 0 1 6.2 4Zm0 4.2h11.6M8 2.5v3M16 2.5v3M8.2 11h2.2M13.6 11h2.2M8.2 15h2.2M13.6 15h2.2"/>
      </svg>
    ),
  },
  {
    href: "/conseils",
    label: "Analyses",
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7"/>
        <polyline points="15 7 21 7 21 13"/>
      </svg>
    ),
  },
  {
    href: "/programmes",
    label: "Programmes",
    shortLabel: "Prog.",
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5h7.5A2.5 2.5 0 0 1 17 7v13l-5-2.5L7 20zM11 4.5v13"/>
      </svg>
    ),
  },
];

const coachTabs = [
  {
    href: "/coach",
    label: "Accueil",
    matchExact: true,
    tourId: undefined as string | undefined,
    icon: (active: boolean) => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.5H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z"/>
      </svg>
    ),
  },
  {
    href: "/coach/planning",
    label: "Planning",
    matchExact: false,
    tourId: "coach-planning-tab" as string | undefined,
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8V6.2A2.2 2.2 0 0 1 6.2 4Zm0 4.2h11.6M8 2.5v3M16 2.5v3M8.2 11h2.2M13.6 11h2.2M8.2 15h2.2M13.6 15h2.2"/>
      </svg>
    ),
  },
  {
    href: "/coach/athletes",
    label: "Sportifs",
    matchExact: false,
    tourId: "coach-athletes-tab" as string | undefined,
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: "/coach/programmes",
    label: "Programmes",
    shortLabel: "Prog.",
    matchExact: false,
    tourId: undefined as string | undefined,
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5h7.5A2.5 2.5 0 0 1 17 7v13l-5-2.5L7 20zM11 4.5v13"/>
      </svg>
    ),
  },
];

interface Props {
  role?: "athlete" | "coach";
  /* Sandbox uniquement (2026-08-19) : préfixe les hrefs vers /sandbox/[role]/... au lieu des
     routes réelles /today, /coach... — le tab "home" (/today ou /coach) devient basePath lui-même
     (Today/Coach Control = page d'accueil de la sandbox pour ce rôle), les autres tabs deviennent
     `${basePath}/planning`, `${basePath}/athletes` etc. (suffixe après le préfixe réel /coach
     retiré). undefined = comportement inchangé (app réelle). */
  basePath?: string;
}

function sandboxHref(href: string, basePath: string) {
  if (href === "/today" || href === "/coach") return basePath;
  return basePath + href.replace("/coach", "");
}

/* Bouton "+" central (2026-08-31) : ouvre un petit bottom sheet de routage rapide (Séance /
   Programme) — jamais "Ajouter un sportif" ici, volontairement : action rare/administrative,
   déjà chez elle sur l'onglet Sportifs (InviteModal). Chaque option navigue vers la page réelle
   avec ?quickadd=session|program, lue au montage par WeekClient.tsx/CoachPlanningClient.tsx
   pour ouvrir directement AddSessionModal/CoachSessionModal ou ProgramLibraryPage — pas de state
   partagé entre BottomNav (layout) et ces pages, uniquement du routage. */
function quickAddOptions(role: "athlete" | "coach", basePath?: string) {
  const targetHref = role === "coach" ? "/coach/planning" : "/week";
  const base = basePath ? sandboxHref(targetHref, basePath) : targetHref;
  return [
    { label: "Ajouter une séance", icon: "📝", href: `${base}?quickadd=session` },
    { label: "Nouveau programme", icon: "📚", href: `${base}?quickadd=program` },
  ];
}

export default function BottomNav({ role = "athlete", basePath }: Props) {
  const pathname = usePathname();
  const { isMd } = useBreakpoint();
  const tabs = role === "coach" ? coachTabs : athleteTabs;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);

  function renderTab(tab: (typeof tabs)[number]) {
    const href = basePath ? sandboxHref(tab.href, basePath) : tab.href;
    const isCoachTab = "matchExact" in tab;
    /* Sandbox : le tab "home" (Aujourd'hui/Dashboard) a pour href basePath lui-même, qui est
       aussi le préfixe de TOUTES les autres sous-routes de ce rôle (/sandbox/athlete/week,
       /sandbox/athlete/conseils...) — un simple startsWith(href+"/") le faisait donc matcher
       en permanence, quelle que soit la page réellement affichée. Toujours exact pour ce cas. */
    const isSandboxHomeTab = !!basePath && href === basePath;
    const active = isSandboxHomeTab
      ? pathname === href
      : isCoachTab
      ? (tab.matchExact ? pathname === href : pathname.startsWith(href))
      : (pathname === href || pathname.startsWith(href + "/"));
    const tourId = "tourId" in tab ? tab.tourId : undefined;
    // Libellé plus court sur mobile pour ne jamais tronquer (ex. "Programmes" → "Prog.") — absent
    // pour les tabs qui n'en ont pas besoin (leur label tient déjà en entier sur mobile).
    const label = !isMd && "shortLabel" in tab && tab.shortLabel ? tab.shortLabel : tab.label;
    return (
      <Link
        key={tab.href}
        href={href}
        {...(tourId ? { "data-tour": tourId } : {})}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // minWidth:0 nécessaire pour que la colonne 1fr respecte réellement 1/4 de l'espace —
          // sans ça, la grille CSS refuse par défaut de réduire une piste sous le min-content de
          // son contenu (le libellé le plus long ferait grossir SA colonne au-delà des 3 autres,
          // recassant la symétrie/le centrage du "+" que cette grille égale doit garantir).
          minWidth: 0,
          gap: isMd ? 5 : 4,
          padding: isMd ? "11px 8px" : "9px 3px",
          color: active ? "#f04a08" : "#fff",
          textDecoration: "none",
          transition: "color 0.18s ease, opacity 0.18s ease",
          opacity: active ? 1 : 0.68,
        }}
      >
        {tab.icon(active)}
        <span style={{
          fontSize: isMd ? 10 : 9,
          fontWeight: 1000,
          letterSpacing: isMd ? "0.08em" : "0.02em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}>
          {label}
        </span>
        <span style={{
          width: 16,
          height: 2.5,
          borderRadius: 2,
          background: active ? "#f04a08" : "transparent",
        }} />
      </Link>
    );
  }

  return (
    <>
      <div style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(18px + env(safe-area-inset-bottom,0px))",
        transform: "translateX(-50%)",
        /* Grille symétrique (2026-09-01, retour sur la version flex "content-sized" — cassait le
           centrage du "+" et l'espacement égal entre icônes dès que les 2 tabs de gauche
           n'avaient pas la même largeur cumulée que les 2 de droite, ex. "Aujourd'hui" contre
           "Analyses"). 4 colonnes ÉGALES (1fr) pour les vrais tabs + une colonne fixe pour le "+"
           : les 2 côtés font toujours la même largeur totale, donc le "+" reste géométriquement
           centré et l'espacement entre icônes reste identique partout. Largeur responsive : 440
           max sur mobile (assez pour loger "Aujourd'hui" sans tronquer), 640 sur desktop (largeur
           historique de prod, redemandée explicitement — le mobile seul avait besoin d'être revu). */
        width: isMd ? "min(640px,calc(100vw - 28px))" : "min(440px,calc(100vw - 24px))",
        zIndex: 2147483000,
        pointerEvents: "none",
      }}>
        <nav style={{
          position: "relative",
          width: "100%",
          pointerEvents: "auto",
          display: "grid",
          // Colonne du "+" en 1fr comme les 4 autres (était fixée à 58px, 2026-09-01) : même
          // largeur allouée que les vrais tabs — le cercle (58px) restant plus petit que sa
          // colonne, ça lui donne mécaniquement plus d'air à gauche/droite, demandé explicitement.
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: isMd ? 6 : 3,
          borderRadius: 999,
          padding: isMd ? "9px 16px" : "9px 10px",
          background: "linear-gradient(180deg,#232323,#101010)",
          border: "1px solid rgba(255,255,255,.10)",
          boxShadow: "0 20px 50px rgba(0,0,0,.30)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}>
          {leftTabs.map(renderTab)}
          <div aria-hidden="true" />
          {rightTabs.map(renderTab)}
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            aria-label="Ajouter"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "linear-gradient(180deg,#f04a08,#d44000)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </nav>
      </div>
      {quickAddOpen && (
        <QuickAddSheet options={quickAddOptions(role, basePath)} onClose={() => setQuickAddOpen(false)} />
      )}
    </>
  );
}
