import { Capacitor } from "@capacitor/core";

/* Finitions natives de l'app iOS (2026-10-03) : retours haptiques sur les gestes clés et masquage
   de l'écran de lancement une fois la page affichée. Sans effet dans un navigateur (sauf une courte
   vibration là où le navigateur la permet, Android).
   Plugins déstructurés à l'import, jamais renvoyés depuis une fonction async (piège Proxy Capacitor). */

export type HapticKind = "light" | "medium" | "success";

export function haptic(kind: HapticKind = "light") {
  if (Capacitor.isNativePlatform()) {
    import("@capacitor/haptics").then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === "success") return Haptics.notification({ type: NotificationType.Success });
      return Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
    }).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(kind === "success" ? [12, 40, 12] : 10); } catch { /* non supporté */ }
}

export function hideSplash() {
  if (!Capacitor.isNativePlatform()) return;
  import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 250 })).catch(() => {});
}
