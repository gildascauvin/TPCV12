import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";

/* Verrouillage de page entière (.locked, coin cadenas sur les CTA premium) retiré le 2026-08-19
   (chantier "gating save") : un compte gratuit navigue et interagit librement partout désormais,
   seules les actions d'enregistrement réelles sont gatées (voir requireSubscription() dans chaque
   page cliente — TodayClient/WeekClient/CoachClient/CoachPlanningClient/AthletesClient). Les
   règles CSS `.locked ...` restent dans globals.css (dead code assumé, même principe que d'autres
   classes retirées de leur point d'application ailleurs dans ce repo) — jamais appliquées nulle
   part désormais, aucun risque à les laisser. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.mode as "athlete" | "coach") ?? "athlete";

  return (
    <div className="min-h-screen bg-bg pb-[132px]">
      {children}
      <BottomNav role={role} />
    </div>
  );
}
