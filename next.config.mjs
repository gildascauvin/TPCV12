

const nextConfig = {
  images: {
    remotePatterns: [],
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
