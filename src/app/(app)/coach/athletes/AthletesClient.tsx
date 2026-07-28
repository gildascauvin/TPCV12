"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteModal from "@/components/coach/InviteModal";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import { usePaywall } from "@/hooks/usePaywall";
import type { CoachAthlete, SubscriptionStatus } from "@/types";
import { sigDimInfo, type AthleteSignature } from "@/lib/fatigueSignature";

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }
function statusLabel(s: number) { return s >= 75 ? "Disponible" : s >= 60 ? "Stable" : "À surveiller"; }

// Mini-sparkline condensée : même style que le vrai graphe /conseils (SparkLineClient) — aire
// remplie + trait 2px + point plein pour les lignes, colonnes arrondies pour les barres — mais
// sans le tooltip au survol, et en ne reliant que les jours renseignés (pas d'axe temporel avec
// trous visibles) pour rester lisible en liste dense.
function MiniSpark({ points, color, type = "line" }: { points: (number | null)[]; color: string; type?: "line" | "bars" }) {
  const known = points.filter((p): p is number => p !== null);
  if (known.length < 2) return null;
  const w = 148, h = 30, pad = 4;
  const min = type === "bars" ? 0 : Math.min(...known);
  const max = Math.max(...known, min + 1);
  const range = Math.max(1, max - min);
  const step = (w - pad * 2) / (known.length - 1);
  const toXY = (v: number, i: number): [number, number] => [pad + i * step, pad + (1 - (v - min) / range) * (h - pad * 2)];
  const baseline = h - pad;

  if (type === "bars") {
    const barW = Math.max(3, step * 0.55);
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", marginBottom: 2 }}>
        {known.map((v, i) => {
          if (v === 0) return null;
          const [x, y] = toXY(v, i);
          return <rect key={i} x={x - barW / 2} y={y} width={barW} height={Math.max(0, baseline - y)} rx={1.5} fill={color} fillOpacity={0.75} />;
        })}
      </svg>
    );
  }

  const coords = known.map((v, i) => toXY(v, i));
  const path = coords.map(c => c.join(",")).join(" ");
  const fillD = `M ${coords[0][0]},${baseline} L ${coords.map(c => c.join(",")).join(" L ")} L ${coords[coords.length - 1][0]},${baseline} Z`;
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", marginBottom: 2 }}>
      <path d={fillD} fill={color} fillOpacity={0.12} />
      <polyline points={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3.5} fill={color} stroke="rgba(0,0,0,.4)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Condensé de la signature de fatigue (/conseils) par sportif : coût nerveux, coût musculaire,
// récupération. Plus de libellé "COÛT ÉLEVÉ" à côté de chaque courbe — la couleur et la forme
// suffisent. Colonnes étroites + .sig-grid (globals.css) : espacées sur desktop, empilées sur mobile.
function AthleteSignatureBlock({ signature }: { signature: AthleteSignature }) {
  if (signature.kind === "manual") {
    return (
      <div style={{ paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(0,0,0,.08)", color: "#8a8f94", fontSize: 13, fontStyle: "italic" }}>
        Forme non renseignée — pas de signature de fatigue ni de récupération à afficher.
      </div>
    );
  }
  if (signature.kind === "no_data") {
    return (
      <div style={{ paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(0,0,0,.08)", color: "#8a8f94", fontSize: 13 }}>
        🕳️ Pas de wellness renseigné ces 10 derniers jours — pas de signature de fatigue à afficher.
      </div>
    );
  }

  // Mêmes couleurs que SparkLineClient/conseils/page.tsx : nerveux et musculaire ont une teinte
  // fixe (identité de la métrique), seule la récupération suit le statut dynamique (sigDimInfo).
  const knownRecovery = signature.recovery.filter((v): v is number => v !== null);
  const lastRecovery = knownRecovery[knownRecovery.length - 1];
  const recoveryColor = lastRecovery !== undefined ? sigDimInfo("recovery", lastRecovery).color : "#8a8f94";

  const sigs: Array<{ key: string; icon: string; label: string; points: (number | null)[]; footer: string; type: "line" | "bars"; color: string }> = [
    { key: "nervous", icon: "⚡", label: "Coût nerveux", points: signature.nervous, footer: "intensité, 10 derniers jours", type: "line", color: "#f04a08" },
    { key: "muscular", icon: "💪", label: "Coût musculaire", points: signature.muscular, footer: "volume, 10 derniers jours", type: "bars", color: "#f28a00" },
    { key: "recovery", icon: "🌿", label: "Récupération", points: signature.recovery, footer: "wellness quotidien", type: "line", color: recoveryColor },
  ];

  return (
    <div className="sig-grid" style={{ paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      {sigs.map(s => (
        <div key={s.key}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#62686e", marginBottom: 4, whiteSpace: "nowrap" }}>{s.icon} {s.label}</div>
          <MiniSpark points={s.points} color={s.color} type={s.type} />
          <div style={{ fontSize: 10.5, color: "#8a8f94" }}>{s.footer}</div>
        </div>
      ))}
    </div>
  );
}

function AthleteRing({ score }: { score: number }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color: scoreColor(score) }}>{score}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  initialAthletes: CoachAthlete[];
  signatures: Record<string, AthleteSignature>;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
}

export default function AthletesClient({ userId, initialAthletes, signatures, subscriptionStatus, inviteCode }: Props) {
  const router = useRouter();
  const [athletes, setAthletes] = useState(initialAthletes);
  const [showInvite, setShowInvite] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus);

  async function handleDelete(athlete: CoachAthlete) {
    const label = athlete.user_id ? "Retirer ce sportif de ton espace ?" : "Supprimer ce sportif ?";
    if (!confirm(label)) return;
    setDeleting(athlete.id);
    await fetch("/api/athlete/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachAthleteId: athlete.id }),
    });
    setAthletes(prev => prev.filter(a => a.id !== athlete.id));
    setDeleting(null);
  }

  return (
    <>
      <div className="page-shell">

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Coach</div>
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>Mes sportifs</div>
            <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
              {athletes.length} sportif{athletes.length !== 1 ? "s" : ""} suivi{athletes.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            data-tour="invite-btn"
            onClick={() => requireSubscription(() => setShowInvite(true))}
            style={{ height: 40, paddingLeft: 18, paddingRight: 18, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", flexShrink: 0, marginTop: 4 }}
          >
            + Inviter<span className="tour-lock">🔒</span>
          </button>
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#171b1f", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Invite un sportif pour commencer à suivre son wellness et ses séances.
            </div>
            <button
              data-tour="invite-btn"
              onClick={() => requireSubscription(() => setShowInvite(true))}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Inviter un sportif →<span className="tour-lock">🔒</span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {athletes.map(a => {
              const isPending = !a.user_id && !!a.invite_email;
              return (
              <div key={a.id} style={{
                background: a.user_id ? "#fff" : isPending ? "rgba(255,245,230,.85)" : "rgba(255,255,255,.72)",
                border: a.user_id ? "1px solid rgba(47,158,68,.20)" : isPending ? "1px solid rgba(242,138,0,.25)" : "1px solid rgba(34,54,38,.12)",
                borderRadius: 26, padding: 18,
                boxShadow: a.user_id ? "0 8px 24px rgba(47,158,68,.07)" : "0 12px 32px rgba(32,59,43,.08)",
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  <AthleteRing score={a.wellness_score} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{a.name}</div>
                      {a.user_id && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(47,158,68,.12)", color: "#2f9e44", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>RÉEL</div>
                      )}
                      {isPending && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(242,138,0,.12)", color: "#f28a00", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>EN ATTENTE</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>
                      {isPending
                        ? <span style={{ color: "#f28a00" }}>{a.invite_email}</span>
                        : <>{a.sport}{a.sport ? " · " : ""}<span style={{ color: scoreColor(a.wellness_score), fontWeight: 700 }}>{statusLabel(a.wellness_score)}</span></>
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      data-tour="voir-planning-btn"
                      onClick={() => router.push(`/coach/planning?athlete=${a.id}`)}
                      style={{ height: 34, paddingLeft: 13, paddingRight: 13, borderRadius: 10, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)", whiteSpace: "nowrap" }}
                    >
                      Voir planning<span className="tour-lock">🔒</span>
                    </button>
                    <button
                      data-tour="supprimer-btn"
                      onClick={() => handleDelete(a)}
                      style={{ height: 34, paddingLeft: 12, paddingRight: 12, borderRadius: 10, background: "#fff8f8", border: "1px solid rgba(200,30,30,.20)", color: "#c81e1e", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: deleting === a.id ? 0.5 : 1, whiteSpace: "nowrap" }}
                    >
                      {a.user_id ? "Retirer" : isPending ? "Annuler" : "Supprimer"}<span className="tour-lock">🔒</span>
                    </button>
                  </div>
                </div>

                {!isPending && (
                  <AthleteSignatureBlock signature={signatures[a.id] ?? { kind: "manual" }} />
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onLinked={() => router.refresh()}
          inviteCode={inviteCode}
        />
      )}
      {paywallStep === "priming" && (
        <PrimingJourneyModal mode="coach" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
          onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
      )}
      {paywallStep === "paywall" && (
        <PaywallModal mode="coach" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
