"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthBackground from "@/components/auth/AuthBackground";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setIsFirstTime(new URLSearchParams(window.location.search).get("first") === "1");
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    setLoading(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => { router.push("/today"); router.refresh(); }, 2000);
    }
    setLoading(false);
  }

  const inputWrap = (
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    setShow: (v: boolean) => void,
    placeholder: string
  ) => (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{
          width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
          borderRadius: 16, padding: "14px 48px 14px 16px", fontSize: 15, color: "#171b1f",
          fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
        }}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: "#8a8f94", display: "flex", alignItems: "center",
        }}
        aria-label={show ? "Masquer" : "Afficher"}
      >
        {show ? <EyeOff /> : <EyeOn />}
      </button>
    </div>
  );

  return (
    <AuthBackground>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="ThePerfClub"
            style={{ width: 110, height: 110, borderRadius: 24, objectFit: "cover", boxShadow: "0 16px 40px rgba(0,0,0,.30)", display: "block", margin: "0 auto 14px" }}
          />
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 30, padding: 28, boxShadow: "0 28px 72px rgba(0,0,0,.10)" }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>Mot de passe mis à jour !</div>
              <div style={{ fontSize: 14, color: "#62686e" }}>Redirection en cours…</div>
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 4 }}>
                {isFirstTime ? "Crée ton mot de passe" : "Nouveau mot de passe"}
              </div>
              <div style={{ fontSize: 14, color: "#62686e", marginBottom: 4 }}>
                {isFirstTime
                  ? "Choisis un mot de passe sécurisé d'au moins 8 caractères pour sécuriser ton compte."
                  : "Choisis un mot de passe sécurisé d'au moins 8 caractères."}
              </div>

              {error && (
                <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px" }}>
                  {error}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nouveau mot de passe</div>
                {inputWrap(password, setPassword, showPassword, setShowPassword, "8 caractères minimum")}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Confirmer</div>
                {inputWrap(confirm, setConfirm, showConfirm, setShowConfirm, "Répète le mot de passe")}
              </div>

              <button
                type="submit" disabled={loading}
                style={{ height: 50, borderRadius: 16, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)", marginTop: 4 }}
              >
                {loading ? "..." : "Enregistrer →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AuthBackground>
  );
}

function EyeOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
