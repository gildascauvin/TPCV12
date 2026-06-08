import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { PHProvider } from "@/providers/PostHogProvider";
import { PostHogPageview } from "@/components/PostHogPageview";

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
    <html lang="fr">
      <head>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
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
