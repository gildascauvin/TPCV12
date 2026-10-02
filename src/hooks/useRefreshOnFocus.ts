"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useRefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const handler = () => {
      // Hors ligne : la page peut venir du cache du service worker ; un refresh échouerait et
      // effacerait l'état local (séance en cours, actions en attente).
      if (document.visibilityState === "visible" && navigator.onLine !== false) router.refresh();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [router]);
}
