import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ShareView from "./ShareView";
import type { ShareResourceType } from "@/lib/share";

interface ShareRow { resource_type: ShareResourceType; snapshot: Record<string, unknown> }

const getShare = cache(async (id: string) => {
  const admin = createAdminClient();
  const { data } = await admin.from("shares").select("resource_type, snapshot").eq("id", id).maybeSingle();
  return data as ShareRow | null;
});

function metaFor(row: ShareRow): { title: string; description?: string } {
  const s = row.snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (row.resource_type) {
    case "wellness": return { title: `${s.authorName} — ${s.zoneLabel}`, description: s.recoveryAdvice };
    case "session": return { title: s.name, description: Array.isArray(s.exercises) ? `${s.exercises.length} exercice${s.exercises.length > 1 ? "s" : ""}` : undefined };
    case "charge": return { title: "Charge d'entraînement", description: s.insight };
    case "recuperation": return { title: "Récupération", description: s.insight };
    case "coach_athlete": return { title: `${s.athleteName} — Coach control`, description: s.decision };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getShare(id);
  if (!row) return { title: "Partage — ThePerfClub" };
  const { title, description } = metaFor(row);
  return {
    title: `${title} — ThePerfClub`,
    description,
    openGraph: { title, description, siteName: "ThePerfClub" },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getShare(id);
  if (!row) notFound();
  return <ShareView resourceType={row.resource_type} snapshot={row.snapshot} />;
}
