"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import posthog from "posthog-js";
import { isIOS, isStandalone } from "@/lib/push";

/* Installation de l'app web (2026-10-07). Chrome (Android, ordinateur) envoie `beforeinstallprompt`
   quand l'app est installable : on le garde pour l'ouvrir depuis NOTRE bouton (checklist, profil)
   au lieu de laisser l'utilisateur chercher l'option dans le menu du navigateur.
   L'écoute démarre au chargement du module (importé par NativeShell, monté dans le layout racine) :
   l'événement peut partir tôt, avant le montage des composants qui affichent le bouton.
   iOS Safari n'a pas cet événement : on y renverra vers l'App Store dès que APP_STORE_URL est posé. */

/** Lien App Store, vide tant que l'app n'est pas publiée (rien n'est affiché sur iOS d'ici là). */
export const APP_STORE_URL = "";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

if (typeof window !== "undefined" && !Capacitor.isNativePlatform()) {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); // pas la mini-barre de Chrome : on garde la main sur le moment
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    posthog.capture("pwa_installed");
    emit();
  });
}

export type InstallMode = "prompt" | "app_store" | null;

function getMode(): InstallMode {
  if (typeof window === "undefined" || Capacitor.isNativePlatform() || isStandalone()) return null;
  if (deferred) return "prompt";
  if (isIOS() && APP_STORE_URL) return "app_store";
  return null;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** null = rien à proposer (déjà installée, app native, navigateur sans installation). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getMode, () => null);
}

/** Ouvre la fenêtre d'installation de Chrome (ou l'App Store sur iOS). `surface` = où était le bouton. */
export async function runInstall(surface: string) {
  const mode = getMode();
  if (mode === "app_store") {
    posthog.capture("pwa_install_clicked", { surface, mode });
    window.open(APP_STORE_URL, "_blank");
    return;
  }
  if (mode !== "prompt" || !deferred) return;
  const ev = deferred;
  posthog.capture("pwa_install_clicked", { surface, mode });
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  posthog.capture("pwa_install_result", { surface, outcome });
  deferred = null; // un événement ne sert qu'une fois ; Chrome en renverra un si l'utilisateur a refusé
  emit();
}
