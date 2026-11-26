"use client";

import { useEffect } from "react";

/* En développement, PAS de service worker (25/11) : les fichiers JS du serveur de dev gardent le même nom
   d'une version à l'autre, et le cache-first de sw.js servait une version figée (Gildas testait l'ancien
   code sans le savoir). On désinscrit aussi celui déjà installé et on vide ses caches. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
