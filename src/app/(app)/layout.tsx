import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";

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
