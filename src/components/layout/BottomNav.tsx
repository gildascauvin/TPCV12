"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    label: "Conseils",
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5h7.5A2.5 2.5 0 0 1 17 7v13l-5-2.5L7 20zM11 4.5v13"/>
      </svg>
    ),
  },
  {
    href: "/profil",
    label: "Profil",
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7.4 8.3a7.4 7.4 0 0 1 14.8 0"/>
      </svg>
    ),
  },
];

const coachTabs = [
  {
    href: "/coach",
    label: "Dashboard",
    matchExact: true,
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
    label: "Athlètes",
    matchExact: false,
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
    href: "/profil",
    label: "Profil",
    matchExact: false,
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7.4 8.3a7.4 7.4 0 0 1 14.8 0"/>
      </svg>
    ),
  },
];

interface Props {
  role?: "athlete" | "coach";
}

export default function BottomNav({ role = "athlete" }: Props) {
  const pathname = usePathname();
  const tabs = role === "coach" ? coachTabs : athleteTabs;

  return (
    <div style={{
      position: "fixed",
      left: "50%",
      bottom: "calc(18px + env(safe-area-inset-bottom,0px))",
      transform: "translateX(-50%)",
      width: "min(640px,calc(100vw - 28px))",
      zIndex: 2147483000,
      pointerEvents: "none",
    }}>
      <nav style={{
        width: "100%",
        pointerEvents: "auto",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
        borderRadius: 999,
        padding: 7,
        background: "linear-gradient(180deg,#232323,#101010)",
        border: "1px solid rgba(255,255,255,.10)",
        boxShadow: "0 20px 50px rgba(0,0,0,.30)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}>
        {tabs.map((tab) => {
          const isCoachTab = "matchExact" in tab;
          const active = isCoachTab
            ? (tab.matchExact ? pathname === tab.href : pathname.startsWith(tab.href))
            : (pathname === tab.href || pathname.startsWith(tab.href + "/"));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                borderRadius: 999,
                padding: "11px 6px",
                color: "#fff",
                background: active ? "linear-gradient(180deg,#f04a08,#d44000)" : "transparent",
                textDecoration: "none",
                transition: "all 0.18s ease",
                opacity: active ? 1 : 0.72,
              }}
            >
              {tab.icon(active)}
              <span style={{
                fontSize: 10,
                fontWeight: 1000,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
