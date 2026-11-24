"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import posthog from "@/lib/ph";
import { useInstallMode, runInstall } from "@/lib/pwaInstall";
import { useOnboardingProgress, refreshOnboardingProgress, OPEN_QUICKADD, OPEN_PRIMING } from "@/lib/onboardingProgress";
import { useStreak, refreshStreak, localToday, unseenRewards, markRewardsSeen } from "@/lib/streakClient";
import type { Reward, RewardKey } from "@/lib/streak";
import { WeekStrip, RewardRail, RewardReveal, streakLine, recordLine } from "@/components/streak/StreakView";
import { Flame } from "@/components/streak/Flame";

/* Puce de série du header (P1, 24/11/2026) : remplace la checklist d'onboarding côté sportif, à la même
   place. 🔥 et le nombre de jours, rien d'autre (Gildas : pas d'action écrite dans la puce, pas d'anneau).
   Le panneau garde le rôle de guide de la checklist : la prochaine récompense mène à l'action, et il
   s'ouvre seul une fois par jour tant que les premières récompenses ne sont pas toutes gagnées et que
   la journée n'est pas validée. Côté coach, la checklist reste (voir CalendarHeader). */

const SHEET_W = 520;
const AUTO_KEY = "tpc_streak_auto_opened";
const FIRST_STEPS = new Set(["form", "build", "adjust", "unlock"]);

export default function StreakPill() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const sandbox = pathname.startsWith("/sandbox");
  useOnboardingProgress(!sandbox); // garde les événements onboarding_checklist_*_completed (funnels)
  const s = useStreak(!sandbox);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<RewardKey | null>(null);
  const [fresh, setFresh] = useState<Reward | null>(null);
  const installMode = useInstallMode();

  useEffect(() => { if (!sandbox) { refreshStreak(); refreshOnboardingProgress(); } }, [pathname, sandbox]);

  useEffect(() => {
    if (!s?.enabled) return;
    const firstPending = s.rewards.some(r => FIRST_STEPS.has(r.key) && !r.earned);
    if (!firstPending || s.todayState.validated) return;
    const today = localToday();
    let last: string | null = null;
    try { last = localStorage.getItem(AUTO_KEY); } catch { /* stockage indisponible */ }
    if (last === today) return;
    setOpen(true);
    posthog.capture("streak_panel_opened", { auto: true, current: s.current });
    try { localStorage.setItem(AUTO_KEY, today); } catch { /* idem */ }
  }, [s]);

  useEffect(() => {
    if (!open || !s?.enabled) return;
    const u = unseenRewards(s);
    if (u[0]) { setFresh(u[0]); markRewardsSeen(u.map(r => r.key)); posthog.capture("streak_reward_revealed", { reward: u[0].key, surface: "panel" }); }
  }, [open, s]);

  useEffect(() => {
    if (open && installMode) posthog.capture("pwa_install_cta_viewed", { surface: "streak", mode: installMode });
  }, [open, installMode]);

  /* Feuille du bas : Échap ferme, le fond ne défile pas. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!s?.enabled) return null;

  function runReward(r: Reward) {
    posthog.capture("streak_next_reward_clicked", { reward: r.key });
    if (FIRST_STEPS.has(r.key)) posthog.capture("onboarding_checklist_step_clicked", { role: "athlete", step: r.key, done: r.earned, surface: "streak" });
    setOpen(false);
    if (r.key === "form") router.push("/today?checkin=1");
    else if (r.key === "build") {
      if ((window as unknown as { __tpcActivityPill?: number }).__tpcActivityPill) window.dispatchEvent(new Event(OPEN_QUICKADD));
      else { try { sessionStorage.setItem("tpc_open_activity_pill", "1"); } catch { /* idem */ } router.push("/today"); }
    }
    else if (r.key === "adjust") router.push("/today?today=1");
    else if (r.key === "unlock") window.dispatchEvent(new CustomEvent(OPEN_PRIMING, { detail: { source: "streak" } }));
  }
  const earned = s.rewards.filter(r => r.earned).length;

  return (
    <>
      <button
        onClick={() => { setOpen(o => !o); setSelected(null); setFresh(null); if (!open) posthog.capture("streak_panel_opened", { auto: false, current: s.current }); }}
        aria-expanded={open}
        aria-label={`Ta série : ${s.current} jour${s.current > 1 ? "s" : ""}${s.todayState.validated ? ", journée validée" : ", journée à valider"}`}
        style={{
          height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 14px 0 10px", borderRadius: 999, cursor: "pointer",
          background: s.todayState.validated ? "rgba(255,122,40,.16)" : "rgba(255,255,255,.08)",
          border: `1px solid ${s.todayState.validated ? "rgba(255,138,85,.5)" : "rgba(255,255,255,.16)"}`,
          color: s.todayState.validated ? "#fff" : "rgba(255,255,255,.75)",
          fontFamily: "inherit", fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", transition: "background .3s, border-color .3s",
        }}
      >
        <Flame lit={s.todayState.validated} size={20} />{s.current}
      </button>
      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483090, background: "rgba(4,6,8,.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
          <div role="dialog" aria-modal="true" aria-label="Ta série" style={{
            position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)", zIndex: 2147483095, width: `min(${SHEET_W}px, 100vw)`,
            maxHeight: "88dvh", overflowY: "auto", animation: "sheetInUp .32s cubic-bezier(.32,.72,0,1)",
            background: "#1a1f24", borderTop: "1px solid rgba(255,255,255,.14)", borderRadius: "28px 28px 0 0",
            padding: "10px 18px calc(22px + env(safe-area-inset-bottom, 0px))",
            boxShadow: "0 -20px 50px rgba(0,0,0,.55)", color: "#fff",
          }}>
            <div aria-hidden style={{ width: 38, height: 4, borderRadius: 4, background: "rgba(255,255,255,.22)", margin: "0 auto 4px" }} />
            {(

              <>
                <div style={{ textAlign: "center", margin: "0 -18px", padding: "14px 18px 4px", background: s.todayState.validated ? "radial-gradient(90% 80% at 50% 0%, rgba(232,70,10,.28), rgba(26,31,36,0) 75%)" : "none" }}>
                  <Flame lit={s.todayState.validated} size={64} glow />
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{s.current}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.75)", marginTop: 4 }}>{s.current === 0 ? "ta série commence aujourd'hui" : s.current > 1 ? "jours d'affilée" : "jour d'affilée"}</div>
                  {streakLine(s) && <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 8, lineHeight: 1.45 }}>{streakLine(s)}</div>}
                </div>
                <div style={{ marginTop: 14 }}><WeekStrip s={s} /></div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)", textAlign: "center", marginTop: 10 }}>{recordLine(s)}</div>
                {fresh && <div style={{ marginTop: 14 }}><RewardReveal r={fresh} /></div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "16px 0 6px" }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>Récompenses</span>
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)" }}>{earned} sur {s.rewards.length}</span>
                </div>
                <RewardRail rewards={s.rewards} next={s.next} selected={selected}
                  onSelect={k => { setSelected(k); posthog.capture("streak_reward_selected", { reward: k }); }}
                  onGo={r => runReward(r)} />
                {installMode && (
                  <button onClick={() => { setOpen(false); runInstall("checklist"); }} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", marginTop: 10, padding: "11px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>📲</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>Installer l&apos;app</span>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: "rgba(255,255,255,.62)", marginTop: 3 }}>Une icône sur ton écran d&apos;accueil, en un tap.</span>
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

