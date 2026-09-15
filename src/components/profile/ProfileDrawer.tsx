"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import NotificationToggle from "./NotificationToggle";
import LogoutButton from "@/components/auth/LogoutButton";
import PaywallModal from "@/components/paywall/PaywallModal";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";
import type { Profile } from "@/types";

const SPORTS = [
  "Haltérophilie", "Sprint", "Préparation physique", "CrossFit",
  "Fitness", "Rugby", "Football", "Natation", "Cyclisme",
  "Course à pied", "Tennis", "Basketball", "Arts martiaux", "Autre",
];

type Sexe = "homme" | "femme" | null;

interface ProfileDrawerProps {
  onClose: () => void;
  sandboxMode?: boolean;
  /* Sandbox uniquement — quel fixture construire (aucun backend réel, voir sandboxFixtures.ts).
     Statique par appelant (Today/Week/Conseils = athlete, Coach/CoachPlanning/Athletes = coach). */
  sandboxRole?: "athlete" | "coach";
}

function buildSandboxProfile(role: "athlete" | "coach"): Profile {
  if (role === "coach") {
    const { coachName } = buildCoachFixture();
    return {
      id: "sandbox-coach-profile", user_id: "sandbox-coach", name: coachName, sport: null, objective: null,
      freq_target: null, mode: "coach", subscription_status: "free", stripe_customer_id: null,
      onboarding_done: true, invite_code: null, training_days: null, free_training_label: {},
      sexe: null, poids_kg: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  }
  return buildAthleteFixture().profile;
}

/* Remplace /profil (page dédiée) + EditProfileModal (drawer imbriqué) — les deux montraient des
   informations différentes et se chevauchaient de façon confuse (2026-09-15). Un seul drawer,
   ouvert directement depuis l'icône profil du header (CalendarHeader), qui se fetch lui-même via
   /api/profile plutôt que de thread profile/email/hasActiveCoach à travers 6+ pages serveur. */
export default function ProfileDrawer({ onClose, sandboxMode = false, sandboxRole = "athlete" }: ProfileDrawerProps) {
  const { isMd } = useBreakpoint();
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(sandboxMode ? buildSandboxProfile(sandboxRole) : null);
  const [email, setEmail] = useState(sandboxMode ? "demo@theperfclub.com" : "");
  const [loading, setLoading] = useState(!sandboxMode);

  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [sexe, setSexe] = useState<Sexe>(null);
  const [poidsInput, setPoidsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sandboxGateOpen, setSandboxGateOpen] = useState(false);

  useEffect(() => {
    if (sandboxMode) return;
    (async () => {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setEmail(data.email);
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || "");
    setSport(profile.sport || "");
    setSexe(profile.sexe ?? null);
    setPoidsInput(profile.poids_kg != null ? String(profile.poids_kg) : "");
  }, [profile]);

  const initials = profile?.name
    ? profile.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  function goToSignup() {
    if (!profile) return;
    router.push(`/register?role=${profile.mode}`);
  }

  async function handleSave() {
    if (!profile || !name.trim()) return;
    setSaving(true);
    const poids_kg = poidsInput.trim() ? parseFloat(poidsInput.trim().replace(",", ".")) : null;
    const data = { name: name.trim(), sport: sport || null, sexe, poids_kg: Number.isFinite(poids_kg) ? poids_kg : null };
    if (sandboxMode) {
      setProfile(prev => (prev ? { ...prev, ...data } : prev));
    } else {
      const { data: saved } = await supabase.from("profiles").update(data).eq("user_id", profile.user_id).select().single();
      if (saved) setProfile(saved as Profile);
      router.refresh();
    }
    setSaving(false);
  }

  async function handlePortal() {
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
    setPortalLoading(false);
  }

  const subLabel = profile ? profile.subscription_status : "free";
  const subActive = subLabel === "athlete" || subLabel === "coach";
  const subText = subLabel === "athlete" ? "Sportif" : subLabel === "coach" ? "Coach" : subLabel === "expired" ? "Expiré" : "Gratuit";
  const subColor = subActive ? "#2f9e44" : subLabel === "expired" ? "#d10000" : "#8a8f94";
  const subBg = subActive ? "rgba(47,158,68,.1)" : subLabel === "expired" ? "rgba(209,0,0,.08)" : "rgba(0,0,0,.05)";

  return (
    <>
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          display: "flex", alignItems: "stretch", justifyContent: isMd ? "flex-end" : "stretch",
          zIndex: 2147483100, overflow: "hidden",
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{
          background: "#fff", color: "#171b1f",
          boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
          borderRadius: isMd ? "28px 0 0 28px" : 0,
          width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
          height: "100dvh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Mon compte</div>
                <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f" }}>Profil</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                style={{ width: 36, height: 36, borderRadius: "50%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.08)", cursor: "pointer", fontSize: 18, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >×</button>
            </div>

            {loading ? (
              <div style={{ fontSize: 13, color: "#8a8f94", padding: "20px 0" }}>Chargement…</div>
            ) : !profile ? (
              <div style={{ fontSize: 13, color: "#8a8f94", padding: "20px 0" }}>Impossible de charger le profil.</div>
            ) : (
              <>
                {/* Avatar + prénom */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff0e9", border: "1px solid rgba(212,64,0,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 1000, color: "#d44000", flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Prénom</div>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Ex: Alex"
                      style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                {/* Email — lecture seule, lié à l'auth */}
                <div style={{ marginBottom: 16, borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 12, color: "#8a8f94", flexShrink: 0 }}>Email</div>
                  <div style={{ fontSize: 13, color: "#171b1f", fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{email}</div>
                </div>

                {/* Sport principal — pré-remplit les futurs programmes générés, jamais requis */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Sport principal</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {SPORTS.map(s => (
                      <button
                        key={s} onClick={() => setSport(prev => (prev === s ? "" : s))}
                        style={{
                          padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .14s",
                          border: sport === s ? "1px solid rgba(212,64,0,.40)" : "1px solid rgba(0,0,0,.10)",
                          background: sport === s ? "rgba(212,64,0,.08)" : "#f7f8f9",
                          color: sport === s ? "#d44000" : "#62686e",
                        }}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                {/* Sexe & poids — optionnels, servent uniquement à situer les tests de performance
                    sur les repères de la littérature (force relative, W/kg...). */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Sexe &amp; poids</div>
                  <div style={{ fontSize: 12.5, color: "#8a8f94", lineHeight: 1.5, marginBottom: 10 }}>
                    Optionnel. Débloque des repères comme la force relative au poids de corps sur tes tests de performance.
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {([["homme", "Homme"], ["femme", "Femme"], [null, "Non précisé"]] as [Sexe, string][]).map(([val, label]) => (
                      <button
                        key={label} onClick={() => setSexe(val)}
                        style={{
                          flex: 1, padding: "10px 10px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .14s",
                          border: sexe === val ? "1px solid rgba(212,64,0,.40)" : "1px solid rgba(0,0,0,.10)",
                          background: sexe === val ? "rgba(212,64,0,.08)" : "#f7f8f9",
                          color: sexe === val ? "#d44000" : "#62686e",
                        }}
                      >{label}</button>
                    ))}
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number" inputMode="decimal" value={poidsInput} onChange={e => setPoidsInput(e.target.value)}
                      placeholder="Poids (optionnel)"
                      style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 44px 13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#8a8f94" }}>kg</span>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  style={{ width: "100%", height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: !name.trim() ? 0.6 : 1, marginBottom: 24 }}
                >
                  {saving ? "..." : "Enregistrer ✓"}
                </button>

                {/* Abonnement */}
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>Abonnement</div>
                <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: "16px 16px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, color: subColor, background: subBg }}>
                        {subText}
                      </span>
                      {subActive && <span style={{ fontSize: 12, color: "#62686e" }}>Plan actif</span>}
                      {subLabel === "free" && <span style={{ fontSize: 12, color: "#62686e" }}>Version gratuite</span>}
                      {subLabel === "expired" && <span style={{ fontSize: 12, color: "#d10000" }}>Abonnement expiré</span>}
                    </div>
                    {subActive ? (
                      <button
                        onClick={handlePortal}
                        disabled={portalLoading}
                        style={{ height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                      >
                        {portalLoading ? "..." : "Gérer"}
                      </button>
                    ) : (
                      <button
                        onClick={() => (sandboxMode ? setSandboxGateOpen(true) : setPaywallOpen(true))}
                        style={{ height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
                      >
                        S'abonner
                      </button>
                    )}
                  </div>
                </div>

                <NotificationToggle />

                <LogoutButton />
              </>
            )}
          </div>
        </div>
      </div>

      {profile && paywallOpen && (
        <PaywallModal
          mode={profile.mode as "athlete" | "coach"}
          allowDismiss
          onClose={() => setPaywallOpen(false)}
          onSuccess={() => { setPaywallOpen(false); router.refresh(); }}
        />
      )}
      {profile && sandboxGateOpen && (
        <SandboxGateModal role={profile.mode} page="profil" onClose={() => setSandboxGateOpen(false)} onSignup={goToSignup} />
      )}
    </>
  );
}
