"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onLinked: () => void;
  inviteCode?: string | null;
}

export default function InviteModal({ onClose, onLinked, inviteCode }: Props) {
  const [email, setEmail] = useState("");
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"linked" | "pending" | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleInvite() {
    const emails = [email, ...extraEmails].map(e => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setSaving(true);
    setError(null);
    const results = await Promise.all(emails.map(async athleteEmail => {
      const res = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteEmail }),
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, linked: json.linked as boolean | undefined, error: json.error as string | undefined };
    }));
    setSaving(false);
    const sent = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);
    setSentCount(sent.length);
    if (sent.length) {
      setResult(sent.some(r => r.linked) ? "linked" : "pending");
      if (sent.some(r => r.linked)) onLinked();
    }
    if (failed.length && !sent.length) {
      setError(failed[0].error || "Une erreur est survenue.");
    } else if (failed.length) {
      setError(`${failed.length} invitation${failed.length > 1 ? "s" : ""} sur ${emails.length} n'${failed.length > 1 ? "ont" : "a"} pas pu être envoyée${failed.length > 1 ? "s" : ""}.`);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>

        {result ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>{result === "linked" ? "🔗" : "✅"}</div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>
              {sentCount > 1 ? "Invitations enregistrées !" : result === "linked" ? "Sportif lié !" : "Invitation enregistrée !"}
            </div>
            <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.6, marginBottom: 24 }}>
              {sentCount > 1
                ? <>Tes <strong style={{ color: "#171b1f" }}>{sentCount} sportifs</strong> rejoindront ton espace dès qu&apos;ils créeront leur compte.</>
                : result === "linked"
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

            {/* Lien d'invitation */}
            {inviteCode && (
              <div style={{ background: "rgba(212,64,0,.05)", border: "1.5px solid rgba(212,64,0,.18)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#d44000", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                  Lien d'invitation
                </div>
                <div style={{ fontSize: 12, color: "#d44000", fontWeight: 700, wordBreak: "break-all" as const, marginBottom: 10 }}>
                  go.theperfclub.com/join/{inviteCode}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2500);
                    }}
                    style={{ flex: 1, height: 38, borderRadius: 11, background: linkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "background .2s" }}
                  >
                    {linkCopied ? "✓ Copié !" : "📋 Copier le lien"}
                  </button>
                  <button
                    onClick={() => {
                      const msg = encodeURIComponent(`Salut ! Je viens de m'inscrire sur ThePerfClub pour suivre notre entraînement. Rejoins mon espace ici : https://go.theperfclub.com/join/${inviteCode}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                    }}
                    style={{ height: 38, paddingLeft: 14, paddingRight: 14, borderRadius: 11, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 18, cursor: "pointer" }}
                  >
                    📲
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, marginBottom: 14 }}>
              Ou invite par email — le sportif sera lié dès qu'il créera son compte.
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
              style={{ width: "100%", boxSizing: "border-box" as const, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
            />

            {extraEmails.map((extraEmail, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="email"
                  value={extraEmail}
                  onChange={e => setExtraEmails(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                  onKeyDown={e => e.key === "Enter" && email.trim() && handleInvite()}
                  placeholder="sportif@exemple.com"
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box" as const, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                />
                <button
                  onClick={() => setExtraEmails(arr => arr.filter((_, idx) => idx !== i))}
                  style={{ width: 44, flexShrink: 0, borderRadius: 14, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#8a8f94", fontSize: 16, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={() => setExtraEmails(arr => [...arr, ""])}
              style={{ background: "none", border: "none", color: "#d44000", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0, marginBottom: 16 }}
            >
              + Inviter un autre sportif
            </button>

            <button
              onClick={handleInvite}
              style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", opacity: saving || !email.trim() ? 0.6 : 1, marginBottom: 10 }}
            >
              {saving ? "Vérification…" : "Inviter par email →"}
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
