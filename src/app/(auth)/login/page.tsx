"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

type View = "login" | "magic-sent" | "forgot" | "reset-sent";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Email ou mot de passe incorrect.");
    } else {
      router.push("/today");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleMagicLink() {
    if (!email) { setError("Entre ton email d'abord."); return; }
    setLoading(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setView("magic-sent");
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError("Entre ton email."); return; }
    setLoading(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?type=recovery`,
    });
    if (error) setError(error.message);
    else setView("reset-sent");
    setLoading(false);
  }

  const inputStyle = {
    width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 16, padding: "14px 16px", fontSize: 15, color: "#171b1f",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f0ee", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 18, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 12px 30px rgba(212,64,0,.30)", marginBottom: 14 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f" }}>ThePerfClub</div>
          <div style={{ fontSize: 14, color: "#62686e", marginTop: 4 }}>Ton espace d'entraînement intelligent</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 30, padding: 28, boxShadow: "0 28px 72px rgba(0,0,0,.10)" }}>

          {/* ── Vue : lien envoyé (magic) ── */}
          {view === "magic-sent" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>Lien envoyé !</div>
              <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.5 }}>
                Vérifie ta boîte mail<br /><strong style={{ color: "#171b1f" }}>{email}</strong>
              </div>
              <button onClick={() => setView("login")} style={{ marginTop: 20, fontSize: 13, color: "#d44000", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
                ← Retour
              </button>
            </div>
          )}

          {/* ── Vue : email de reset envoyé ── */}
          {view === "reset-sent" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>Email envoyé !</div>
              <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.5 }}>
                Un lien de réinitialisation a été envoyé à<br /><strong style={{ color: "#171b1f" }}>{email}</strong>
              </div>
              <button onClick={() => setView("login")} style={{ marginTop: 20, fontSize: 13, color: "#d44000", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
                ← Retour à la connexion
              </button>
            </div>
          )}

          {/* ── Vue : mot de passe oublié ── */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 4 }}>
                Mot de passe oublié
              </div>
              <div style={{ fontSize: 14, color: "#62686e", marginBottom: 4 }}>
                Entre ton email et on t'envoie un lien pour le réinitialiser.
              </div>

              {error && (
                <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px" }}>
                  {error}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" required style={inputStyle} />
              </div>

              <button
                type="submit" disabled={loading}
                style={{ height: 50, borderRadius: 16, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)", marginTop: 4 }}
              >
                {loading ? "..." : "Envoyer le lien →"}
              </button>

              <button type="button" onClick={() => { setView("login"); setError(null); }} style={{ fontSize: 13, color: "#62686e", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textAlign: "center" as const }}>
                ← Retour à la connexion
              </button>
            </form>
          )}

          {/* ── Vue : connexion principale ── */}
          {view === "login" && (
            <form onSubmit={handlePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 4 }}>
                Connexion
              </div>

              {error && (
                <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px" }}>
                  {error}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" required style={inputStyle} />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Mot de passe</div>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(null); }}
                    style={{ fontSize: 12, color: "#d44000", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Oublié ?
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ ...inputStyle, paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#8a8f94", display: "flex", alignItems: "center" }}
                    aria-label={showPassword ? "Masquer" : "Afficher"}
                  >
                    {showPassword ? <EyeOff /> : <EyeOn />}
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                style={{ height: 50, borderRadius: 16, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)", marginTop: 4 }}
              >
                {loading ? "..." : "Se connecter →"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
                <span style={{ fontSize: 12, color: "#8a8f94" }}>ou</span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
              </div>

              <button
                type="button" onClick={handleMagicLink} disabled={loading}
                style={{ height: 46, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Connexion par lien magique
              </button>

              <div style={{ textAlign: "center", fontSize: 13, color: "#8a8f94", marginTop: 4 }}>
                Pas encore de compte ?{" "}
                <Link href="/register" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>
                  Créer un compte
                </Link>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
