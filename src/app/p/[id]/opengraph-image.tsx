import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { OG_SIZE, OgFrame, OgRing, ogFonts, ogIcon, ogPhoto } from "@/lib/og/ogKit";
import { DEFAULT_ONBOARDING_COVER, SPORT_COVER_PROGRAM, programCover } from "@/lib/programCovers";

/* Aperçu d'un programme partagé (08/11/2026) : sa couverture, son nom, son format, et l'anneau recalibré. */
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Programme d'entraînement sur ThePerfClub";
export const revalidate = 3600;

export default async function Image({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data } = await admin.from("programs").select("id, name, sport, weeks_count, sessions_per_week").eq("id", params.id).eq("is_public", true).maybeSingle();
  const cover = programCover(data?.id) ?? (data?.sport ? programCover(SPORT_COVER_PROGRAM[data.sport]) : null) ?? DEFAULT_ONBOARDING_COVER;
  const [fonts, icon, photo] = await Promise.all([ogFonts(), ogIcon(), ogPhoto(cover)]);
  const name = (data?.name ?? "").split(/\s[–—-]\s/)[0];
  const meta = [data?.sport, data?.weeks_count ? `${data.weeks_count} semaines` : null].filter(Boolean).join(" · ");
  const perWeek = data?.sessions_per_week ? `${data.sessions_per_week} séance${data.sessions_per_week > 1 ? "s" : ""} par semaine, ajustée${data.sessions_per_week > 1 ? "s" : ""} à ta forme chaque matin.` : "Un programme qui s'ajuste à ta forme, chaque matin.";
  return new ImageResponse(
    /* Programme introuvable ou privé : l'aperçu générique, sans répéter « programme » trois fois. */
    <OgFrame photo={photo} icon={icon} eyebrow={data ? meta || "Programme" : "Ton point forme, 10 secondes"}
      title={!data ? "Un programme qui s'ajuste à ta forme" : name.length > 70 ? `${name.slice(0, 68).replace(/\s\S*$/, "")}…` : name}
      sub={data ? perWeek : "Chaque matin, ta séance suit ta récupération."}
      ring={<OgRing size={440} value={6} zone={[5, 6]} title={"Séance\nrecalibrée"} glow="#2f9e44" recup={48} charge={52} />} />,
    { ...OG_SIZE, fonts },
  );
}
