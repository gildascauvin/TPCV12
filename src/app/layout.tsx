import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { PHProvider } from "@/providers/PostHogProvider";
import { PostHogPageview } from "@/components/PostHogPageview";

const dmSans = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-dm-sans",
});

/* Police mono additive (2026-09-25, glow-up typo — POC `theperfclub_poc_landing_main_sportif_v1.html`,
   `--fm`) : DM Sans reste la police par défaut du corps de l'app (globals.css) — celle-ci n'est
   utilisée QUE pour les badges/labels/chiffres "data" (ZoneBadge, eyebrows) là où le POC utilise
   `--fm`, jamais pour les titres (`--fd`, une police d'affichage distincte, hors scope de ce chantier
   — l'appliquer aux h1/h2/h3 diviserait la typo entre cette page et le reste de l'app). Poids max
   disponible 700 (pas 900) — les `fontWeight:900` déjà en place ailleurs dégradent proprement vers
   le poids le plus proche chargé. */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ThePerfClub",
  description: "Coaching sportif basé sur l'autorégulation",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ThePerfClub",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#d44000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${plexMono.variable}`}>
      <head>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://eu.i.posthog.com" />
        <link rel="preconnect" href="https://www.theperfclub.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://js.stripe.com" />
      </head>
      <body>
        <PHProvider>
          <PostHogPageview />
          {children}
        </PHProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
