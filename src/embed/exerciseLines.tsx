/* Script d'intégration pour les landings WordPress (2026-10-07) : le MÊME rendu de séance et le MÊME
   moteur d'ajustement que l'app, compilés depuis les vrais modules (aucune copie). Servi par l'app à
   https://go.theperfclub.com/embed/exercise-lines.js, régénéré à chaque build (scripts/build-embed.mjs),
   donc les landings suivent l'app à chaque déploiement.
   API : window.TPCExercise.renderSession(notes, { adjustPct, compact }) → HTML (synthèse + lignes),
         .adjustNotes(notes, pct), .pointsToPct(points). */
import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseLinesBox, SessionSynthesis } from "@/components/sessions/ExerciseLineView";
import { adjustNotes } from "@/lib/sessionLevers";
import { pointsToPct } from "@/lib/autoregulation";

function renderSession(notes: string, opts: { adjustPct?: number | null; compact?: boolean } = {}): string {
  const lines = (notes ?? "").split("\n").filter(l => l.trim());
  return renderToStaticMarkup(
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "inherit" }}>
      <SessionSynthesis notes={lines.join("\n")} adjustPct={opts.adjustPct} compact={opts.compact} />
      <ExerciseLinesBox lines={lines} adjustPct={opts.adjustPct} compact={opts.compact ?? false} />
    </div>,
  );
}

(window as unknown as { TPCExercise: unknown }).TPCExercise = { renderSession, adjustNotes, pointsToPct };
