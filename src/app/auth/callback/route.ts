import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  if (type === "recovery") {
    const first = searchParams.get("first");
    return NextResponse.redirect(`${origin}/reset-password${first ? "?first=1" : ""}`);
  }

  const d = searchParams.get("d");
  if (d) {
    return NextResponse.redirect(`${origin}/register?d=${d}`);
  }

  return NextResponse.redirect(`${origin}/today`);
}
