"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isOffline } from "@/lib/offlineSessions";

/* Point forme obligatoire (2026-11-04, POC « L'anneau, niveau 4 ») : tant que celui du jour n'est pas fait,
   l'espace sportif ramène à /today, où il s'ouvre sans « Plus tard ». Ni séance ni Planning avant d'avoir
   répondu. Hors ligne : pas de garde (impossible de vérifier, et le point forme hors ligne est mis en file). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function PointFormeGate({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/today") || pathname.startsWith("/coach") || isOffline()) return;
    let alive = true;
    createClient().from("wellness_daily").select("bedtime").eq("user_id", userId).eq("date", localToday()).maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return;
        if (!data || data.bedtime == null) router.replace("/today");
      });
    return () => { alive = false; };
  }, [pathname, userId, router]);
  return null;
}
