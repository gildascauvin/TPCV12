"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { Capacitor } from "@capacitor/core";
import { invalidatePhysio } from "@/lib/physioData";

/* Profil (sportif) : liaison au compte Garmin Connect (2026-10-23). Le nom « Garmin » est cité en texte
   simple (charte Garmin : pas de logo modifié ni inventé). Connecter = navigation vers
   /api/garmin/connect (OAuth2 PKCE côté serveur), retour ici avec ?garmin=connected|denied|error.
   App iPhone : l'app n'ouvre que go.theperfclub.com, la page Garmin part donc dans Safari et le retour
   s'y affiche ; on relit le statut quand le sportif revient dans l'app. */

type Status = { configured: boolean; connected: boolean; connectedAt: string | null };

export default function GarminRow() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const connectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/garmin/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        if (!alive || !s) return;
        // Retour de Safari (app iPhone) : connecté entre-temps.
        if (connectedRef.current === false && s.connected) {
          posthog.capture("garmin_connected", { via: "safari" });
          setMessage("Garmin connecté : tes prochaines nuits et séances arriveront toutes seules.");
          invalidatePhysio();
        }
        connectedRef.current = s.connected;
        setStatus(s);
      })
      .catch(() => {});
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    // Retour d'OAuth : event + message, puis on nettoie l'URL.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("garmin");
    if (result) {
      if (result === "connected") { posthog.capture("garmin_connected"); setMessage("Garmin connecté : tes prochaines nuits et séances arriveront toutes seules."); }
      else if (result === "denied") setMessage("Connexion Garmin annulée.");
      else setMessage("La connexion à Garmin a échoué. Réessaie.");
      params.delete("garmin");
      const q = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
    }
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!status) return null;

  async function connect() {
    posthog.capture("garmin_connect_started", { native: Capacitor.isNativePlatform() });
    if (!Capacitor.isNativePlatform()) {
      // Web : retour sur l'Accueil, qui rouvre le profil pour afficher le résultat.
      window.location.href = "/api/garmin/connect?next=/today";
      return;
    }
    // App : le lien est créé côté serveur (lié au sportif), puis ouvert dans Safari.
    setBusy(true);
    try {
      const res = await fetch("/api/garmin/connect?json=1", { cache: "no-store" });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error();
      setMessage("Connecte-toi à Garmin dans Safari, puis reviens ici.");
      if (!window.open(data.url, "_blank")) window.location.href = data.url;
    } catch {
      setMessage("La connexion à Garmin a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/garmin/disconnect", { method: "POST" });
      if (!res.ok) throw new Error();
      posthog.capture("garmin_disconnected");
      connectedRef.current = false;
      setStatus((s) => (s ? { ...s, connected: false, connectedAt: null } : s));
      setMessage("Garmin déconnecté : tes données Garmin ont été supprimées.");
      invalidatePhysio();
    } catch {
      setMessage("La déconnexion a échoué. Réessaie.");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 12, flexShrink: 0, cursor: busy ? "default" : "pointer",
    border: primary ? "none" : "1px solid rgba(0,0,0,.12)", fontSize: 12, fontWeight: 800,
    background: primary ? "linear-gradient(180deg,#f04a08,#d44000)" : "#fff", color: primary ? "#fff" : "#171b1f",
    opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: "16px 16px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, color: "#171b1f" }}>⌚ Garmin</div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>
            {status.connected
              ? "Connecté · VFC, sommeil, FC au repos et séances"
              : status.configured
                ? "Connecte ta montre Garmin : VFC, sommeil et séances"
                : "Bientôt disponible"}
          </div>
        </div>
        {status.connected ? (
          confirm ? (
            <button disabled={busy} onClick={disconnect} style={btn(true)}>{busy ? "…" : "Confirmer"}</button>
          ) : (
            <button onClick={() => setConfirm(true)} style={btn(false)}>Déconnecter</button>
          )
        ) : status.configured ? (
          <button disabled={busy} onClick={connect} style={btn(true)}>{busy ? "…" : "Connecter"}</button>
        ) : null}
      </div>
      {confirm && (
        <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 10 }}>
          Tes données reçues de Garmin seront supprimées de ThePerfClub.{" "}
          <button onClick={() => setConfirm(false)} style={{ border: "none", background: "none", padding: 0, color: "#171b1f", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Annuler</button>
        </div>
      )}
      {message && <div style={{ fontSize: 12, color: "#171b1f", marginTop: 10 }}>{message}</div>}
    </div>
  );
}
