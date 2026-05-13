"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import EditProfileModal from "@/components/profile/EditProfileModal";
import LogoutButton from "@/components/auth/LogoutButton";
import type { Profile, Session, WellnessDaily, Objective } from "@/types";

const OBJ_LABELS: Record<string, string> = {
  performance: "🏆 Performance",
  longevite: "🌱 Longévité",
  stress: "🧘 Anti-stress",
  composition: "💪 Composition",
  equilibre: "⚖️ Équilibre",
  rehab: "🩹 Réhabilitation",
};

const BEHAVIOR_LABELS: Record<string, string> = {
  alcohol: "🍷 Alcool",
  late_sleep: "🌙 Couché tardif",
  tobacco: "🚬 Tabac",
  screen_late: "📱 Écran tard",
  heavy_meal: "🍔 Repas lourd",
  caffeine_late: "☕ Caféine tard",
  social_out: "🎉 Sortie sociale",
  travel: "✈️ Voyage",
};

interface Props {
  profile: Profile;
  email: string;
  doneSessions: Session[];
  avgRpe: number | null;
  avgWellness: number | null;
  allBehaviors: string[];
}

export default function ProfilClient({ profile: initialProfile, email, doneSessions, avgRpe, avgWellness, allBehaviors }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [editOpen, setEditOpen] = useState(false);

  const initials = profile.name
    ? profile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  async function handleSaveProfile(data: { name: string; sport: string; objective: Objective; freq_target: number }) {
    const { data: saved } = await supabase.from("profiles").update(data).eq("user_id", profile.user_id).select().single();
    if (saved) setProfile(saved as Profile);
    setEditOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="page-shell">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Mon compte</div>
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>Profil</div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            style={{ height: 38, paddingLeft: 16, paddingRight: 16, borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginTop: 4 }}
          >
            ✏ Modifier
          </button>
        </div>

        {/* User card */}
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 20, marginBottom: 14, boxShadow: "0 8px 24px rgba(0,0,0,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff0e9", border: "1px solid rgba(212,64,0,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 1000, color: "#d44000", flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#171b1f", letterSpacing: "-0.02em" }}>{profile.name || "—"}</div>
              <div style={{ fontSize: 13, color: "#62686e", marginTop: 2 }}>{profile.sport || "Sport non renseigné"}</div>
            </div>
          </div>

          {profile.objective && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 25, border: "0.5px solid rgba(212,64,0,.22)", background: "rgba(212,64,0,.07)", fontSize: 12, fontWeight: 700, color: "#d44000" }}>
                {OBJ_LABELS[profile.objective] || profile.objective}
              </span>
            </div>
          )}

          <div style={{ borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#8a8f94" }}>Séances / semaine ciblées</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f" }}>{profile.freq_target ?? "—"}</div>
          </div>

          <div style={{ borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#8a8f94", flexShrink: 0 }}>Email</div>
            <div style={{ fontSize: 13, color: "#171b1f", fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{email}</div>
          </div>
        </div>

        {/* Stats cette semaine */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>Stats cette semaine</div>
        <div className="stats-grid-3" style={{ marginBottom: 22 }}>
          {[
            { value: doneSessions.length, label: "SÉANCES" },
            { value: avgRpe ?? "—", label: "DIFF. MOY." },
            { value: avgWellness ?? "—", label: "WELLNESS" },
          ].map(({ value, label }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: "16px 10px", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 28, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.05em", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Comportements récents */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>Comportements récents</div>
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: "14px 16px", marginBottom: 22 }}>
          {allBehaviors.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allBehaviors.map(b => (
                <span key={b} style={{ border: "1px solid rgba(212,64,0,.30)", color: "#d44000", background: "rgba(212,64,0,.08)", fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700 }}>
                  {BEHAVIOR_LABELS[b] || b}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#8a8f94", textAlign: "center", padding: "4px 0" }}>Aucun comportement renseigné cette semaine</div>
          )}
        </div>

        <LogoutButton />
      </div>

      {editOpen && (
        <EditProfileModal
          initialName={profile.name || ""}
          initialSport={profile.sport || ""}
          initialObjective={profile.objective}
          initialFreq={profile.freq_target}
          onSave={handleSaveProfile}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
