

const nextConfig = {
  images: {
    // theperfclub.com héberge l'image de fond plein-écran de value_intro (élément LCP de
    // /register, ~3550x4438px non optimisée servie en <img> brut jusqu'ici) — autorisé ici
    // pour que next/image puisse la redimensionner/reconvertir automatiquement.
    remotePatterns: [
      { protocol: "https", hostname: "www.theperfclub.com" },
      { protocol: "https", hostname: "theperfclub.com" },
    ],
  },
  // Script des landings (public/embed, voir scripts/build-embed.mjs) : cache 1 h + revalidation en
  // arrière-plan, il n'est retéléchargé qu'une fois par visiteur et suit l'app à chaque déploiement.
  async headers() {
    return [{ source: "/embed/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] }];
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
    // opengraph-image.tsx lit public/fonts/*.woff via fs.readFile() a l'execution — Next.js ne
    // peut pas detecter cette dependance par analyse statique, donc la fonction serverless deployee
    // ne contenait jamais ces fichiers (ENOENT en prod, jamais reproduit en dev ou le filesystem
    // local est complet). Inclusion explicite requise pour ce cas precis.
    outputFileTracingIncludes: {
      "/**/*": ["./public/fonts/**/*"],
    },
  },
};

export default nextConfig;
