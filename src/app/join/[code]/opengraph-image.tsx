import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { OG_SIZE, OgFrame, OgRing, ogFonts, ogIcon, ogPhoto } from "@/lib/og/ogKit";
import { DEFAULT_ONBOARDING_COVER } from "@/lib/programCovers";

/* Aperçu du lien d'invitation d'un coach (08/11/2026) : qui invite, et ce que le sportif y gagne. */
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Invitation à rejoindre un groupe sur ThePerfClub";

export default async function Image({ params }: { params: { code: string } }) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("name").eq("invite_code", params.code).maybeSingle();
  const first = data?.name?.trim().split(/\s+/)[0] || null;
  const [fonts, icon, photo] = await Promise.all([ogFonts(), ogIcon(), ogPhoto(DEFAULT_ONBOARDING_COVER)]);
  return new ImageResponse(
    <OgFrame photo={photo} icon={icon} eyebrow="Invitation"
      title={first ? `${first} t'invite dans son groupe` : "Ton coach t'invite dans son groupe"}
      sub="Ton point forme en 10 secondes, ta séance ajustée chaque matin."
      ring={<OgRing size={440} value={5} zone={[5, 6]} title={"Fenêtre\noptimale"} glow="#2f9e44" recup={62} charge={45} />} />,
    { ...OG_SIZE, fonts },
  );
}
