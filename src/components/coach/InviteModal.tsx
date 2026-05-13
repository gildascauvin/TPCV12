"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onLinked: () => void;
}

export default function InviteModal({ onClose, onLinked }: Props) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"linked" | "pending" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/invite/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteEmail: email.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Une erreur est survenue.");
    } else {
      setResult(json.linked ? "linked" : "pending");
      if (json.linked) onLinked();
    }
    setSaving(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>

        {result ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>{result === "linked" ? "🔗" : "✅"}</div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>
              {result === "linked" ? "Sportif lié !" : "Invitation enregistrée !"}
            </div>
            <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.6, marginBottom: 24 }}>
              {result === "linked"
                ? <><strong style={{ color: "#171b1f" }}>{email}</strong> avait déjà un compte — il est maintenant lié à ton espace.</>
                : <>Dès que <strong style={{ color: "#171b1f" }}>{email}</strong> créera son compte sur ThePerfClub, il sera automatiquement lié à ton espace.</>
              }
            </div>
            <button
              onClick={onClose}
              style={{ width: "100%", height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 6 }}>
              Inviter un sportif
            </div>
            <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, marginBottom: 22 }}>
              Entre l'adresse email de ton athlète. S'il a déjà un compte, le lien est immédiat. Sinon, il sera lié dès qu'il créera son compte.
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8f94", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 7 }}>
              Email du sportif
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && email.trim() && handleInvite()}
              placeholder="sportif@exemple.com"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box" as const, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", marginBottom: 16 }}
            />

            <button
              onClick={handleInvite}
              style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", opacity: saving || !email.trim() ? 0.6 : 1, marginBottom: 10 }}
            >
              {saving ? "Vérification…" : "Inviter →"}
            </button>

            <button
              onClick={onClose}
              style={{ width: "100%", height: 44, borderRadius: 14, background: "none", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}
