/* Compile src/embed/exerciseLines.tsx → public/embed/exercise-lines.js (script autonome des landings).
   Lancé avant chaque `next build` (prebuild) pour que le script suive toujours le code de l'app. */
import { build } from "esbuild";
import path from "node:path";

await build({
  entryPoints: ["src/embed/exerciseLines.tsx"],
  outfile: "public/embed/exercise-lines.js",
  bundle: true, minify: true, format: "iife", target: "es2018", jsx: "automatic",
  alias: { "@": path.resolve("src") },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "info",
});
