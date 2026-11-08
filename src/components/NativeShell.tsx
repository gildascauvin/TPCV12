"use client";

import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { hideSplash } from "@/lib/native";
import { initNativeNotifications } from "@/lib/notifications";
import "@/lib/pwaInstall"; // démarre l'écoute de l'invite d'installation de Chrome au chargement

/* App iOS (2026-10-03) : masque l'écran de lancement une fois la page affichée (gardé jusque-là pour
   éviter le flash et l'écran vide du chargement), et pose la classe `native` sur <html> pour
   retirer les réflexes "page web" (sélection de texte, menu de l'appui long — voir globals.css). */
export default function NativeShell() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native");
    /* Pas de zoom dans l'app (2026-10-06) : iOS zoome sur un champ dont le texte fait moins de 16px
       et on ne pouvait plus dézoomer. Dans l'app seulement : le web garde le zoom (accessibilité). */
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    hideSplash();
    /* Android (2026-10-28) : barres système toujours sombres, mais en mode clair du téléphone les
       icônes (heure, batterie) passaient en gris foncé, invisibles. On force les icônes claires. */
    if (Capacitor.getPlatform() === "android") SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
    // Notifications (2026-10-14) : tap sur une notif → sa page ; jeton APNs renvoyé s'il a changé.
    initNativeNotifications((url) => router.push(url)).catch(() => {});
    /* Lien magique ouvert dans l'app (08/11, lien universel) : on charge la même adresse dans l'app, la route
       /auth/callback connecte puis renvoie vers l'accueil ou l'étape d'onboarding atteinte. Rien sans le
       plugin (anciens builds) : le lien s'ouvre alors dans le navigateur, comme avant. */
    let remove: (() => void) | null = null;
    if (Capacitor.isPluginAvailable("App")) {
      import("@capacitor/app").then(({ App }) => App.addListener("appUrlOpen", ({ url }) => {
        try {
          const u = new URL(url);
          if (u.host === "go.theperfclub.com") window.location.href = `${u.pathname}${u.search}`;
        } catch { /* lien illisible */ }
      })).then(h => { remove = () => { h.remove(); }; }).catch(() => {});
    }
    return () => { remove?.(); };
  }, [router]);
  return null;
}
