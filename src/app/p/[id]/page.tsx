import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Program } from "@/types";
import PublicProgramView from "./PublicProgramView";

export const revalidate = 60;

const getProgram = cache(async (id: string) => {
  const admin = createAdminClient();
  const { data } = await admin.from("programs").select("*").eq("id", id).eq("is_public", true).maybeSingle();
  return data as Program | null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProgram(id);
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

  const program = await getProgram(id);

  if (!program) notFound();

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("user_id", (program as Program).owner_id)
    .maybeSingle();

  const p = program as Program;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ExercisePlan",
    name: p.name,
    description: [p.sport, p.level, p.weeks_count ? `${p.weeks_count} semaines` : null, p.sessions_per_week ? `${p.sessions_per_week} séances/sem` : null].filter(Boolean).join(" · "),
    url: `https://go.theperfclub.com/p/${p.id}`,
    provider: { "@type": "Organization", name: "ThePerfClub", url: "https://go.theperfclub.com" },
    ...(p.weeks_count && { additionalProperty: { "@type": "PropertyValue", name: "Durée", value: `${p.weeks_count} semaines` } }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicProgramView program={p} coachName={profile?.name ?? null} />
    </>
  );
}
