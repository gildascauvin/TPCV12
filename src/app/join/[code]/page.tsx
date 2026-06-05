import { createAdminClient } from "@/lib/supabase/admin";
import JoinRedirect from "./JoinRedirect";
import { notFound } from "next/navigation";

export default async function JoinPage({ params }: { params: { code: string } }) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("invite_code", params.code)
    .maybeSingle();

  if (!profile) notFound();

  return <JoinRedirect code={params.code} coachName={profile.name} />;
}
