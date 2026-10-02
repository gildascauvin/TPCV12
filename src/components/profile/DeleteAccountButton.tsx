"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/nativeGoogleAuth";

/* Suppression de compte (2026-10-01, exigée par Apple, guideline 5.1.1(v)). Lien discret en bas du
   profil → confirmation explicite → POST /api/account/delete → déconnexion. Un abonnement Apple ne
   peut pas être résilié par nous : la confirmation le rappelle dans l'app iOS. */
export default function DeleteAccountButton({ hasStripeSub }: { hasStripeSub: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const native = isNativeApp();

  async function confirmDelete() {
    setBusy(true); setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "La suppression n'a pas pu aboutir. Réessaie.");
      setBusy(false);
      return;
    }
    await createClient().auth.signOut().catch(() => {});
    window.location.href = "/login?deleted=1";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", color: "#b42318", fontSize: 12.5, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
      >
        Supprimer mon compte
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 2147483300 }}
        >
          <div style={{ background: "#fff", borderRadius: 24, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 800, color: "#171b1f", marginBottom: 10 }}>Supprimer ton compte ?</div>
            <div style={{ fontSize: 14, color: "#3a3f44", lineHeight: 1.55 }}>
              Ton compte et toutes tes données seront supprimés définitivement : séances, ressentis, données de ta montre, programmes, tests et vidéos. Si tu es coach, tes sportifs gardent leur propre compte mais ne seront plus liés à toi.
            </div>
            {hasStripeSub && (
              <div style={{ fontSize: 13, color: "#3a3f44", lineHeight: 1.5, marginTop: 10 }}>
                Ton abonnement souscrit sur le site sera résilié automatiquement.
              </div>
            )}
            {native && (
              <div style={{ fontSize: 13, color: "#b42318", lineHeight: 1.5, marginTop: 10, padding: "10px 12px", background: "rgba(180,35,24,.06)", borderRadius: 12 }}>
                Si tu t&apos;es abonné via l&apos;App Store, résilie aussi ton abonnement dans Réglages → ton nom → Abonnements : Apple continuerait sinon de le facturer.
              </div>
            )}
            {error && <div style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                style={{ flex: 1, height: 46, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#3a3f44", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Annuler
              </button>
              <button type="button" onClick={confirmDelete} disabled={busy}
                style={{ flex: 1, height: 46, borderRadius: 16, border: "none", background: busy ? "#ccc" : "#b42318", color: "#fff", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
                {busy ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
