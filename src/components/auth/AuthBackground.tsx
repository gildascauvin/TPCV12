"use client";

/* Decorative static app preview rendered behind auth/onboarding screens */
export default function AuthBackground({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {/* ── Fake app preview (blurred) ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "#f1f0ee",
        filter: "blur(2px) saturate(0.9)",
        transform: "scale(1.04)",
        pointerEvents: "none", userSelect: "none",
        overflow: "hidden",
      }}>
        {/* Calendar header */}
        <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.07)", padding: "14px 18px 12px", display: "flex", gap: 6, justifyContent: "center" }}>
          {["L","M","M","J","V","S","D"].map((d, i) => (
            <div key={i} style={{ flex: 1, maxWidth: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8f94", letterSpacing: "0.06em" }}>{d}</div>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: i === 2 ? "linear-gradient(180deg,#f04a08,#d44000)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: i === 2 ? 900 : 600,
                color: i === 2 ? "#fff" : "#1f2428",
              }}>{11 + i}</div>
              {i === 1 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#d44000" }} />}
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Wellness card */}
          <div style={{
            borderRadius: 22, padding: 18,
            background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            {/* Ring */}
            <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="33" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
                <circle cx="40" cy="40" r="33" fill="none" stroke="#d44000" strokeWidth="7"
                  strokeDasharray={`${2 * Math.PI * 33 * 0.78} ${2 * Math.PI * 33}`}
                  strokeDashoffset={2 * Math.PI * 33 * 0.25}
                  strokeLinecap="round" transform="rotate(-90 40 40)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>78</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.6)", fontWeight: 700, marginTop: 2 }}>RÉCUP.</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Zone stable</div>
              <div style={{ fontSize: 17, fontWeight: 950, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.2 }}>Bonne forme,<br />prêt à performer</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {[["😴","7h30"],["💆","Récup"],["⚡","Motiv"]].map(([icon, label]) => (
                  <div key={label} style={{ background: "rgba(255,255,255,.10)", borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "rgba(255,255,255,.75)", fontWeight: 700 }}>
                    {icon} {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Session cards */}
          {[
            { name: "Squat lourd 5×5", diff: 8, tag: "Dure", tagColor: "#d44000", tagBg: "#fff0ed", done: false },
            { name: "Interval run 6×400m", diff: 6, tag: "Modérée", tagColor: "#b96500", tagBg: "#fff7e6", done: true },
            { name: "Récupération active", diff: 3, tag: "Facile", tagColor: "#2f9e44", tagBg: "#edf9f0", done: false },
          ].map((s, i) => (
            <div key={i} style={{
              background: s.done ? "#f7f8f9" : "#fff",
              border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              opacity: s.done ? 0.65 : 1,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#1f2428", letterSpacing: "-0.02em", textDecoration: s.done ? "line-through" : "none" }}>{s.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <div style={{ width: 56, height: 5, borderRadius: 3, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(22, Math.min(100, s.diff * 10))}%`, height: "100%", background: s.tagColor, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, background: s.tagBg, color: s.tagColor, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>{s.tag}</span>
                </div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: s.done ? "#eef8f1" : "linear-gradient(180deg,#f04a08,#d44000)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.done
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: "linear-gradient(180deg,rgba(52,84,61,0.96),rgba(31,58,42,0.98))",
          padding: "10px 32px 20px",
          display: "flex", justifyContent: "space-around",
        }}>
          {[["📅","Aujourd'hui",true],["📆","Semaine",false],["💡","Conseils",false],["👤","Profil",false]].map(([icon, label, active]) => (
            <div key={String(label)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: active ? 1 : 0.55 }}>
              <div style={{ fontSize: 20 }}>{icon}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>{String(label).toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dark overlay ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, rgba(0,0,0,.82) 0%, rgba(17,10,5,.88) 60%, rgba(30,12,0,.84) 100%)",
        backdropFilter: "blur(1px)",
      }} />

      {/* ── Content (card, form, etc.) — independent scroll layer ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 10,
        overflowY: "auto",
      }}>
        <div style={{
          minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
