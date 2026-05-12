import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThePerfClub",
  description: "Coaching sportif basé sur l'autorégulation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
