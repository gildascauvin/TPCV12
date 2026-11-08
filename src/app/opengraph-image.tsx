import { ImageResponse } from "next/og";
import { OG_SIZE, OgFrame, OgRing, ogFonts, ogIcon, ogPhoto } from "@/lib/og/ogKit";
import { DEFAULT_ONBOARDING_COVER } from "@/lib/programCovers";

/* Aperçu par défaut des liens go.theperfclub.com (08/11/2026) : l'accroche de l'onboarding + l'anneau qui allège. */
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "ThePerfClub : ta séance s'ajuste à ta forme chaque matin";

export default async function Image() {
  const [fonts, icon, photo] = await Promise.all([ogFonts(), ogIcon(), ogPhoto(DEFAULT_ONBOARDING_COVER)]);
  return new ImageResponse(
    <OgFrame photo={photo} icon={icon} eyebrow="Ton point forme, 10 secondes"
      title="Ton programme ne sait pas que tu as mal dormi. ThePerfClub, si."
      sub="Chaque matin, ta séance s'ajuste à ta forme."
      ring={<OgRing size={440} value={8} zone={[5, 6]} title="Gère l'effort" glow="#d44000" recup={19} charge={56} />} />,
    { ...OG_SIZE, fonts },
  );
}
