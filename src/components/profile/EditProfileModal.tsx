"use client";

import { useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { Objective } from "@/types";

const SPORTS = [
  "Haltérophilie", "Sprint", "Préparation physique", "CrossFit",
  "Fitness", "Rugby", "Football", "Natation", "Cyclisme",
  "Course à pied", "Tennis", "Basketball", "Arts martiaux", "Autre",
];

const OBJECTIVES: { id: Objective; icon: string; label: string }[] = [
  { id: "performance", icon: "🏆", label: "Performance" },
  { id: "longevite", icon: "🌱", label: "Longévité" },
  { id: "stress", icon: "🧘", label: "Anti-stress" },
  { id: "composition", icon: "💪", label: "Composition" },
  { id: "equilibre", icon: "⚖️", label: "Équilibre" },
  { id: "rehab", icon: "🩹", label: "Réhabilitation" },
];

type Sexe = "homme" | "femme" | null;

interface EditProfileModalProps {
  initialName: string;
  initialSport: string;
  initialObjective: Objective | null;
  initialFreq: number | null;
  initialSexe: Sexe;
  initialPoids: number | null;
  onSave: (data: { name: string; sport: string; objective: Objective; freq_target: number; sexe: Sexe; poids_kg: number | null }) => Promise<void>;
  onClose: () => void;
}

export default function EditProfileModal({
  initialName, initialSport, initialObjective, initialFreq, initialSexe, initialPoids, onSave, onClose,
}: EditProfileModalProps) {
  const { isMd } = useBreakpoint();
  const [name, setName] = useState(initialName);
  const [sport, setSport] = useState(initialSport);
  const [objective, setObjective] = useState<Objective | null>(initialObjective);
  const [freq, setFreq] = useState(initialFreq ?? 4);
  const [sexe, setSexe] = useState<Sexe>(initialSexe);
  const [poidsInput, setPoidsInput] = useState(initialPoids != null ? String(initialPoids) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !sport || !objective) return;
    setSaving(true);
    const poids_kg = poidsInput.trim() ? parseFloat(poidsInput.trim().replace(",", ".")) : null;
    await onSave({ name: name.trim(), sport, objective, freq_target: freq, sexe, poids_kg: Number.isFinite(poids_kg) ? poids_kg : null });
    setSaving(false);
  }

  return (
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
          <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", marginBottom: 4 }}>
            Modifier le profil
          </div>
          <div style={{ fontSize: 14, color: "#62686e", marginBottom: 22 }}>
            Tes informations personnalisent l'expérience.
          </div>

          {/* Prénom */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Prénom</div>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Alex"
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
            />
          </div>

          {/* Sport */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Sport principal</div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
              {SPORTS.map(s => (
                <button
                  key={s} onClick={() => setSport(s)}
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

          {/* Objectif */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Objectif</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {OBJECTIVES.map(o => (
                <button
                  key={o.id} onClick={() => setObjective(o.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", borderRadius: 16, cursor: "pointer", textAlign: "left" as const, transition: "all .14s",
                    border: objective === o.id ? "1px solid rgba(212,64,0,.36)" : "1px solid rgba(0,0,0,.09)",
                    background: objective === o.id ? "rgba(212,64,0,.07)" : "#f7f8f9",
                    color: objective === o.id ? "#d44000" : "#62686e",
                    fontWeight: 700, fontSize: 13,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fréquence */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>
              Fréquence cible — <span style={{ color: "#d44000" }}>{freq} séance{freq > 1 ? "s" : ""}/semaine</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7].map(f => (
                <button
                  key={f} onClick={() => setFreq(f)}
                  style={{
                    height: 44, borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: "pointer", transition: "all .14s",
                    border: freq === f ? "none" : "1px solid rgba(0,0,0,.10)",
                    background: freq === f ? "linear-gradient(180deg,#f04a08,#d44000)" : "#f7f8f9",
                    color: freq === f ? "#fff" : "#62686e",
                    boxShadow: freq === f ? "0 6px 16px rgba(212,64,0,.22)" : "none",
                  }}
                >{f}</button>
              ))}
            </div>
          </div>

          {/* Sexe & poids — optionnels, servent uniquement à situer les tests de performance sur les
              repères de la littérature (force relative, W/kg...) ; un repère qui en a besoin reste
              simplement grisé tant qu'ils ne sont pas renseignés. */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 4 }}>Sexe &amp; poids</div>
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
            <div style={{ position: "relative" as const }}>
              <input
                type="number" inputMode="decimal" value={poidsInput} onChange={e => setPoidsInput(e.target.value)}
                placeholder="Poids (optionnel)"
                style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 44px 13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#8a8f94" }}>kg</span>
            </div>
          </div>
        </div>

        {/* Footer sticky, non-scrollable (fond opaque simple, même convention que les autres drawers
            de l'app — jamais un gradient à stop en pourcentage). */}
        <div style={{ flexShrink: 0, padding: "16px 28px 20px", background: "#fff", borderTop: "1px solid rgba(0,0,0,.06)", display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave} disabled={saving || !name.trim() || !sport || !objective}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: (!name.trim() || !sport || !objective) ? 0.6 : 1 }}
          >
            {saving ? "..." : "Enregistrer ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
