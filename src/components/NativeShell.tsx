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
    hideSplash();
  }, []);
  return null;
}
