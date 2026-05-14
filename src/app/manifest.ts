import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThePerfClub",
    short_name: "PerfClub",
    description: "Ton espace d'entraînement intelligent",
    start_url: "/today",
    display: "standalone",
    background_color: "#f1f0ee",
    theme_color: "#d44000",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
