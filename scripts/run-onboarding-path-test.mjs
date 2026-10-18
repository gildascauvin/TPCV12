// Compile la matrice des parcours d'onboarding avec esbuild (déjà en devDep) puis l'exécute.
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const out = join(tmpdir(), `onboarding-path-test-${process.pid}.mjs`);
await build({ entryPoints: ["scripts/onboarding-path.test.ts"], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
execFileSync(process.execPath, [out], { stdio: "inherit" });
