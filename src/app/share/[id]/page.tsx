import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ShareView from "./ShareView";
import { getShare, metaFor } from "./shareMeta";

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
