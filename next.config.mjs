

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
