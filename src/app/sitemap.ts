import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient();
  const { data: programs } = await admin
    .from("programs")
    .select("id, updated_at")
    .eq("is_public", true);

  return (programs ?? []).map((p) => ({
    url: `https://go.theperfclub.com/p/${p.id}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}
