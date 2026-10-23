"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { signupPlatform } from "@/lib/native";
import { APP_STORE_URL } from "@/lib/pwaInstall";
import { syncHealthData } from "@/lib/healthSync";
import { invalidatePhysio, type PhysioData } from "@/lib/physioData";

/* Encart « ta montre » de l'onglet analyses pendant la collecte (2026-10-23, POC
   https://claude.ai/artifact/8WtC2JiFrJUR4auL7nEQVq). Les mesures sont gratuites : ramener la montre
   remplit les charts avec l'historique (Apple Santé : 30 jours relus) au lieu d'attendre les check-ins.
   Un écran par cas :
   - mesures déjà là (FC au repos ou VFC sur 30 jours) : rien, les charts se remplissent ;
   - Garmin connecté sans mesure encore : « tes données arrivent après ta prochaine nuit » ;
   - app iPhone sans aucune donnée Santé : « Autoriser Apple Santé » ;
   - app iPhone avec Santé mais sans FC/VFC : pas de montre, rien ;
   - web iPhone : App Store ; web Android : Garmin ; ordinateur : QR de l'app + Garmin ;
   - « Je n'ai pas de montre » : masqué pour de bon sur cet appareil.
   Sportif seulement (le coach ne lit pas health_*). */

const DISMISS_KEY = (uid: string) => `tpc_no_watch_${uid}`;

const card: React.CSSProperties = { background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 };
const eyebrow: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7dd3fc" };
const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.3, color: "#fff" };
const text: React.CSSProperties = { fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,.7)" };
const primary: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, borderRadius: 12, border: "none", background: "#d44000", color: "#fff", fontWeight: 800, fontSize: 14.5, cursor: "pointer", textDecoration: "none", fontFamily: "inherit" };
const secondary: React.CSSProperties = { ...primary, background: "transparent", border: "1px solid rgba(255,255,255,.18)", fontWeight: 700, fontSize: 14 };
const foot: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,.55)", textAlign: "center" };
const brands = "Apple Watch, Garmin, Whoop, Oura, Polar, Coros, Suunto";

type Case = "web_iphone" | "web_android" | "web_desktop" | "ios_no_health" | "garmin_waiting" | null;

export default function WatchPrompt({ userId, physio }: { userId: string; physio: PhysioData | null }) {
  const [garmin, setGarmin] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY(userId)) === "1"); } catch { setDismissed(false); }
    let alive = true;
    fetch("/api/garmin/status", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { connected?: boolean } | null) => { if (alive) setGarmin(!!d?.connected); })
      .catch(() => { if (alive) setGarmin(false); });
    return () => { alive = false; };
  }, [userId]);

  if (!physio || garmin === null) return null; // pas encore chargé
  const health = physio.health;
  const hasMeasures = health.some(h => h.resting_hr != null || h.hrv_ms != null);
  if (hasMeasures) return null;

  const platform = signupPlatform();
  let kase: Case = null;
  if (garmin) kase = "garmin_waiting";
  else if (dismissed) kase = null;
  else if (platform === "IOS_APP") kase = health.length === 0 ? "ios_no_health" : null;
  else if (platform === "IPHONE") kase = "web_iphone";
  else if (platform === "ANDROID") kase = Capacitor.isNativePlatform() ? null : "web_android";
  else kase = "web_desktop";
  if (!kase) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY(userId), "1"); } catch { /* ignore */ }
    posthog.capture("watch_prompt_no_watch", { case: kase });
    setDismissed(true);
  };
  const connectGarmin = () => {
    posthog.capture("watch_prompt_clicked", { case: kase, action: "garmin" });
    window.location.href = "/api/garmin/connect?next=/today";
  };
  const allowHealth = async () => {
    posthog.capture("watch_prompt_clicked", { case: kase, action: "health" });
    setBusy(true); setError(null);
    try {
      const n = await syncHealthData(createClient(), userId);
      if (n == null) setError("Apple Santé n'a pas pu être lu. Vérifie l'autorisation dans Réglages, Santé.");
      invalidatePhysio();
    } catch {
      setError("Apple Santé n'a pas pu être lu. Réessaie.");
    } finally {
      setBusy(false);
    }
  };
  const noWatchLink = (
    <button type="button" onClick={dismiss} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.55)", fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
      Je n&apos;ai pas de montre
    </button>
  );

  if (kase === "garmin_waiting") {
    return (
      <div style={{ borderRadius: 14, padding: "11px 13px", background: "rgba(125,211,252,.10)", border: "1px solid rgba(125,211,252,.30)", fontSize: 13, lineHeight: 1.45, color: "#fff", marginBottom: 12 }}>
        <b>⌚ Garmin connecté.</b> Tes données arrivent après ta prochaine nuit. D&apos;ici là, ton check-in fait avancer ta norme.
      </div>
    );
  }

  return (
    <div style={card}>
      {kase === "web_iphone" && <>
        <span style={eyebrow}>Tu as une montre ?</span>
        <span style={title}>Ramène tes 30 derniers jours : tes charts se remplissent dès aujourd&apos;hui.</span>
        <span style={text}>L&apos;app iPhone relit Apple Santé : nuits, FC au repos, VFC et entraînements avec leur fréquence cardiaque.</span>
        <a href={APP_STORE_URL} onClick={() => posthog.capture("watch_prompt_clicked", { case: kase, action: "app_store" })} style={{ ...primary, background: "#fff", color: "#070a0d" }}>Télécharger l&apos;app iPhone · gratuit</a>
        <span style={foot}>{brands}</span>
      </>}
      {kase === "web_android" && <>
        <span style={eyebrow}>Tu as une Garmin ?</span>
        <span style={title}>Connecte-la : tes données arrivent après ta prochaine nuit.</span>
        <span style={text}>Nuit, VFC, FC au repos, Body Battery, stress et entraînements. Garmin ne nous transmet que ce qui vient, pas ton historique.</span>
        <button type="button" onClick={connectGarmin} style={primary}>Connecter Garmin · gratuit</button>
        <span style={foot}>Autre montre : l&apos;app Android arrive bientôt.</span>
      </>}
      {kase === "web_desktop" && <>
        <span style={eyebrow}>Tu as une montre ?</span>
        <span style={title}>Tes 30 derniers jours peuvent remplir ces charts dès aujourd&apos;hui.</span>
        <span style={text}>Avec un iPhone : télécharge l&apos;app, elle relit Apple Santé. Avec une Garmin : connecte-la ici, tes données arrivent dès ta prochaine nuit.</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-store-qr.svg" alt="QR code de l'app ThePerfClub sur l'App Store" width={76} height={76} style={{ borderRadius: 10, background: "#fff", padding: 4, flexShrink: 0 }} />
          <span style={{ ...text, fontSize: 12.5 }}>Scanne avec ton iPhone pour télécharger l&apos;app.</span>
        </div>
        <button type="button" onClick={connectGarmin} style={secondary}>Connecter Garmin</button>
        <span style={foot}>{brands}</span>
      </>}
      {kase === "ios_no_health" && <>
        <span style={eyebrow}>Apple Santé</span>
        <span style={title}>Autorise Apple Santé : tes 30 derniers jours remplissent ces charts tout de suite.</span>
        <span style={text}>Nuits, FC au repos, VFC et entraînements. Lecture seule, jamais revendu ni utilisé pour de la publicité.</span>
        <button type="button" onClick={allowHealth} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Lecture d'Apple Santé…" : "Autoriser Apple Santé"}</button>
        {error && <span style={{ ...text, color: "#fca5a5" }}>{error}</span>}
        <span style={foot}>{brands}</span>
      </>}
      {noWatchLink}
    </div>
  );
}
