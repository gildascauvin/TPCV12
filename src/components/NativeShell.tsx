"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { hideSplash } from "@/lib/native";

/* App iOS (2026-10-03) : masque l'écran de lancement une fois la page affichée (gardé jusque-là pour
   éviter le flash et l'écran vide du chargement), et pose la classe `native` sur <html> pour
   retirer les réflexes "page web" (sélection de texte, menu de l'appui long — voir globals.css). */
export default function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native");
    /* Pas de zoom dans l'app (2026-10-06) : iOS zoome sur un champ dont le texte fait moins de 16px
       et on ne pouvait plus dézoomer. Dans l'app seulement : le web garde le zoom (accessibilité). */
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    hideSplash();
  }, []);
  return null;
}
