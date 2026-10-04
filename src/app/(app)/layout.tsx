import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import HealthSyncOnOpen from "@/components/layout/HealthSyncOnOpen";
import OfflineSync from "@/components/layout/OfflineSync";
import LiveSessionHost from "@/components/sessions/LiveSessionHost";
import InviteHost from "@/components/coach/InviteHost";

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
    .select("mode, name")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.mode as "athlete" | "coach") ?? "athlete";

  return (
    <div className="min-h-screen pb-[132px]" style={{ background: "#070a0d" }}>
      {/* Toutes les pages de l'app sont sur fond sombre (DARK_CARD_BG) : le fond de la page
          elle-même aussi, sinon le gris clair réapparaît en bas quand on tire au-delà du contenu
          (rebond du scroll) et sous la barre de navigation. */}
      <style>{"html,body{background:#070a0d}"}</style>
      {children}
      <BottomNav role={role} />
      <HealthSyncOnOpen userId={user.id} />
      <OfflineSync />
      {role === "coach" && <InviteHost />}
      {role === "athlete" && <LiveSessionHost userId={user.id} userName={(profile as { name?: string | null } | null)?.name ?? "Toi"} />}
    </div>
  );
}
