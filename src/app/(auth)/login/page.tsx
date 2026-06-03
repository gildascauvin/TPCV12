"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthBackground from "@/components/auth/AuthBackground";

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: "block" }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
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

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
    <AuthBackground>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="ThePerfClub"
            style={{ width: 110, height: 110, borderRadius: 24, objectFit: "cover", boxShadow: "0 16px 40px rgba(0,0,0,.30)", marginBottom: 14, display: "block", margin: "0 auto 14px" }}
          />
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.60)", marginTop: 4 }}>Ton espace d'entraînement intelligent</div>
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
                type="button" onClick={handleGoogle} disabled={loading}
                style={{ height: 46, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              >
                <GoogleIcon />
                Continuer avec Google
              </button>

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
    </AuthBackground>
  );
}
