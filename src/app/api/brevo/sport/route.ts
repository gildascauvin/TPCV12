import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { brevoSportAttributes } from "@/lib/email/brevoSport";

/* Met à jour le sport du contact Brevo une fois connu (fin des questions post-signup). Le sport est lu
   en base (profiles.sport, écrit par completeProfile), jamais pris du client ; seul l'id du programme
   claimé est transmis, pour reprendre sa photo. */
export async function POST(request: Request) {
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ ok: false });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { claimProgramId } = await request.json().catch(() => ({})) as { claimProgramId?: string | null };
  const { data: profile } = await supabase.from("profiles").select("sport").eq("user_id", user.id).maybeSingle();
  // Programme claimé sans questions de sport : le sport vient du programme lui-même.
  let sport = profile?.sport && profile.sport !== "Autre" ? profile.sport : null;
  if (!sport && claimProgramId) {
    const { data: program } = await supabase.from("programs").select("sport").eq("id", claimProgramId).maybeSingle();
    sport = program?.sport ?? null;
  }
  const attributes = brevoSportAttributes(sport, claimProgramId);

  const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(user.email)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify({ attributes }),
  });
  if (!res.ok && res.status !== 204) {
    console.error("[brevo/sport]", res.status, await res.text());
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
