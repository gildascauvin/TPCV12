import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, subscription_status")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile || (profile as { mode: string }).mode !== "coach") redirect("/today");

  return (
    <div className="px-6 py-5">
      <h1 className="text-lg font-black text-text mb-1">Coach</h1>
      <p className="text-xs text-muted">Page Coach — liste athlètes à construire</p>
    </div>
  );
}
