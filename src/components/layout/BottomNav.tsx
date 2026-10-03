"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const athleteTabs = [
  {
    href: "/today",
    // "Aujourd'hui" → "Accueil" (2026-09-26, retour de Gildas) : cet onglet ne porte plus que la
    // journée depuis que Charge/Récupération/Comportements y ont été ajoutés en onglets
    // (chantier "point 1", 2026-09-24) — "Accueil" décrit mieux ce qu'il est devenu.
    label: "Accueil",
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
    label: "Performance",
    // "Analyses" → "Performance" (2026-09-24, "point 1" — voir POC poc-coach-context_4.html, NAV) :
    // Charge/Récupération/Comportements ont déménagé dans les onglets de l'accueil (HomeTabs.tsx),
    // cette page ("Analyses" avant) ne porte plus que le suivi de tests physiques.
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
    // Remis le 2026-10-03 (retour de Gildas) : sans lui, les programmes n'étaient plus accessibles
    // que depuis le tiroir de la pilule d'activité.
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
    // Même libellé que athleteTabs (la nav est partagée entre les 2 rôles depuis le 2026-09-24,
    // POC poc-coach-context_6.html) — repassé "Aujourd'hui" → "Accueil" le 2026-09-26, voir le
    // commentaire côté athleteTabs. La page reste /coach.
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
    // "Sportifs" → "Performance" (2026-09-24, même libellé/icône que athleteTabs) : href inchangé
    // (/coach/athletes) — même principe que "Analyses"→"Performance" côté sportif, qui avait gardé
    // /conseils. AthletesClient.tsx (contenu de cette page) affiche désormais directement les tests
    // du sportif sélectionné via le sélecteur commun, plutôt que la liste complète, une fois qu'un
    // sportif précis est choisi.
    href: "/coach/athletes",
    label: "Performance",
    matchExact: false,
    tourId: "coach-athletes-tab" as string | undefined,
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

/* Plus de "+" central ni d'onglet Programmes (2026-10-03, POC poc-element-activation-v5.html) : la
   pilule d'activité du header (ActivityPill) porte désormais "Ajouter une séance" et l'accès aux
   programmes. */
export default function BottomNav({ role = "athlete", basePath }: Props) {
  const pathname = usePathname();
  const { isMd } = useBreakpoint();
  const tabs = role === "coach" ? coachTabs : athleteTabs;

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
        // Libellé court sur mobile pour ne jamais tronquer ("Programmes" → "Prog.").
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
          // minWidth:0 : une piste 1fr ne descend pas sous le min-content de son contenu sinon.
          minWidth: 0,
          gap: isMd ? 5 : 4,
          padding: isMd ? "10px 8px 7px" : "9px 3px 6px",
          borderRadius: 999,
          // Icône et texte toujours blancs ; l'onglet actif se repère à sa pastille orange translucide.
          background: active ? "rgba(255,138,85,.12)" : "transparent",
          color: "#fff",
          textDecoration: "none",
          transition: "color 0.18s ease, background 0.18s ease",
        }}
      >
        {tab.icon(active)}
        <span style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: isMd ? 10 : 9.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}>
          {label}
        </span>
      </Link>
    );
  }

  return (
    <div style={{
      position: "fixed",
      left: "50%",
      bottom: "calc(18px + env(safe-area-inset-bottom,0px))",
      transform: "translateX(-50%)",
      /* 4 onglets (2026-10-03) : la checklist d'onboarding vit à côté du profil, dans le header. */
      width: isMd ? "min(560px,calc(100vw - 28px))" : "min(400px,calc(100vw - 24px))",
      zIndex: 2147483000,
      pointerEvents: "none",
    }}>
      <nav style={{
        position: "relative",
        width: "100%",
        pointerEvents: "auto",
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(0, 1fr)",
        gap: isMd ? 6 : 3,
        borderRadius: 999,
        padding: isMd ? "8px 14px" : "7px 8px",
        // Charte de l'app (2026-10-03) : surface sombre translucide posée sur le fond cyan, comme
        // les cartes (au lieu du dégradé gris neutre d'origine).
        background: "rgba(13,18,23,.82)",
        border: "1px solid rgba(255,255,255,.10)",
        boxShadow: "0 18px 44px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.05)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}>
        {tabs.map(renderTab)}
      </nav>
    </div>
  );
}
