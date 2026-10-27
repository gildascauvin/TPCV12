"use client";

/* Monté dans le layout racine : écoute le premier tap sur une démo et ne charge qu'alors le vrai
   lecteur (DemoSheetHost), qui embarque la base de démos, le parseur et la banque d'exercices.
   Importé d'office, ce code pesait sur toutes les pages, inscription comprise. */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DEMO_SHEET_EVENT, type DemoSheetDetail } from "@/lib/demoSheetEvent";

const DemoSheetHost = dynamic(() => import("./ExerciseDemo").then(m => m.DemoSheetHost), { ssr: false });

export default function DemoSheetLauncher() {
  const [first, setFirst] = useState<DemoSheetDetail | null>(null);
  useEffect(() => {
    if (first) return;
    const fn = (e: Event) => setFirst((e as CustomEvent<DemoSheetDetail>).detail);
    window.addEventListener(DEMO_SHEET_EVENT, fn);
    return () => window.removeEventListener(DEMO_SHEET_EVENT, fn);
  }, [first]);
  return first ? <DemoSheetHost initial={first} /> : null;
}
