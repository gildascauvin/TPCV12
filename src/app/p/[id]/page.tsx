import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Program } from "@/types";
import PublicProgramView from "./PublicProgramView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("programs").select("name, sport, level, weeks_count").eq("id", id).eq("is_public", true).maybeSingle();
  if (!data) return { title: "Programme — ThePerfClub" };
  const desc = [data.sport, data.weeks_count ? `${data.weeks_count} semaines` : null].filter(Boolean).join(" · ");
  return {
    title: `${data.name} — ThePerfClub`,
    description: desc || "Programme d'entraînement partagé sur ThePerfClub",
    openGraph: { title: data.name, description: desc || undefined, siteName: "ThePerfClub" },
  };
}

export default async function PublicProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: program } = await admin
    .from("programs")
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (!program) notFound();

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("user_id", (program as Program).owner_id)
    .maybeSingle();

  return <PublicProgramView program={program as Program} coachName={profile?.name ?? null} />;
}
