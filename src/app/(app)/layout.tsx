import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.mode as "athlete" | "coach") ?? "athlete";
  const subscriptionStatus = (profile?.subscription_status as string) ?? "free";

  const { data: coachLink } = await supabase
    .from("coach_athletes")
    .select("id")
    .eq("user_id", user.id)
    .neq("coach_id", user.id)
    .maybeSingle();

  const hasCoach = !!coachLink;
  const isActive = subscriptionStatus === "athlete" || subscriptionStatus === "coach" || (subscriptionStatus === "free" && hasCoach);
  const locked = !isActive;

  return (
    <div className={`min-h-screen bg-bg pb-[132px]${locked ? " locked" : ""}`}>
      {children}
      <BottomNav role={role} />
    </div>
  );
}
