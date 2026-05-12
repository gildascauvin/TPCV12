"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  {
    href: "/today",
    label: "Aujourd'hui",
    icon: (active: boolean) => (
      <svg className="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true"
        fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.5H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z"/>
      </svg>
    ),
  },
  {
    href: "/week",
    label: "Planning",
    icon: (_active: boolean) => (
      <svg className="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8V6.2A2.2 2.2 0 0 1 6.2 4Zm0 4.2h11.6M8 2.5v3M16 2.5v3M8.2 11h2.2M13.6 11h2.2M8.2 15h2.2M13.6 15h2.2"/>
      </svg>
    ),
  },
  {
    href: "/conseils",
    label: "Conseils",
    icon: (_active: boolean) => (
      <svg className="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5h7.5A2.5 2.5 0 0 1 17 7v13l-5-2.5L7 20zM11 4.5v13"/>
      </svg>
    ),
  },
  {
    href: "/profil",
    label: "Profil",
    icon: (_active: boolean) => (
      <svg className="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.15"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7.4 8.3a7.4 7.4 0 0 1 14.8 0"/>
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div style={{
      position: "fixed",
      left: "50%",
      bottom: "calc(22px + env(safe-area-inset-bottom))",
      transform: "translateX(-50%)",
      width: "min(92vw, 640px)",
      zIndex: 2147483000,
      pointerEvents: "none",
    }}>
      <nav
        style={{
          width: "100%",
          pointerEvents: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          borderRadius: 999,
          padding: 6,
          background: "linear-gradient(180deg,rgba(52,84,61,0.96),rgba(31,58,42,0.98))",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 18px 44px rgba(20,38,26,0.34), inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
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
                padding: "11px 8px 10px",
                color: active ? "#fff" : "rgba(255,255,255,0.88)",
                background: active ? "rgba(255,255,255,0.20)" : "transparent",
                boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.18)" : "none",
                textDecoration: "none",
                transition: "all 0.18s ease",
              }}
            >
              {tab.icon(active)}
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.13em",
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
