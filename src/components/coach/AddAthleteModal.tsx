"use client";

import { useState } from "react";
import type { CoachAthlete } from "@/types";
import { wellnessColor } from "@/lib/wellness";

const SPORTS = [
  "Running", "Cyclisme", "Natation", "Triathlon", "Football", "Rugby",
  "Basketball", "Tennis", "Haltérophilie", "CrossFit", "Musculation",
  "Boxe", "Judo", "Escalade", "Ski", "Autre",
];

interface Props {
  athlete?: CoachAthlete | null;
  onSave: (data: { name: string; sport: string; wellness_score: number }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function AddAthleteModal({ athlete, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(athlete?.name ?? "");
  const [sport, setSport] = useState(athlete?.sport ?? "Running");
  const [wellness, setWellness] = useState(athlete?.wellness_score ?? 75);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), sport, wellness_score: wellness });
    setSaving(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm(`Supprimer ${athlete?.name} ?`)) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  // Dégradé séquentiel bleu — voir SparkLineClient.tsx pour la doc complète du choix.
  const wellnessAccent = wellnessColor(wellness);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 20 }}>
          {athlete ? "Modifier le sportif" : "Ajouter un sportif"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nom</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Prénom Nom"
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Sport */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Sport</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SPORTS.map(s => (
                <button key={s} onClick={() => setSport(s)} style={{
                  padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: sport === s ? "#d44000" : "#f0efed",
                  color: sport === s ? "#fff" : "#62686e",
                  border: sport === s ? "none" : "1px solid rgba(0,0,0,.08)",
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Wellness */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Récupération actuelle</div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: wellnessAccent, letterSpacing: "-0.04em" }}>{wellness}/100</div>
            </div>
            <input
              type="range" min={0} max={100} value={wellness}
              onChange={e => setWellness(Number(e.target.value))}
              style={{ width: "100%", accentColor: wellnessAccent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
              <span>Fatigue élevée</span><span>Bonne forme</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ position: "sticky", bottom: 0, margin: "16px -28px 0", padding: "14px 28px 20px", background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {athlete && onDelete && (
              <button onClick={handleDelete} disabled={deleting} style={{ width: 46, height: 50, borderRadius: 14, background: "#fff", border: "1px solid rgba(220,30,30,.22)", color: "#c81e1e", cursor: "pointer", flexShrink: 0, fontSize: 16 }}>
                🗑
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, height: 50, borderRadius: 14, background: "#f0efed", color: "#62686e", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !name.trim()} style={{ flex: 2, height: 50, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}>
              {saving ? "..." : athlete ? "Enregistrer" : "Ajouter →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
