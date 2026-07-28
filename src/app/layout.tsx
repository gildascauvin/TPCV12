import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
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
    <html lang="fr" className={dmSans.variable}>
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
