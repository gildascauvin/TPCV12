import MiniScoreArc from "@/components/ui/MiniScoreArc";

/* Récup du jour en tête de colonne du Planning (06/11) : le seul anneau du jour, même arc de 240° que
   partout, bleu, chiffre en blanc (avant : rond complet « WELL »). */
export default function PlanningRing({ score, size = 58 }: { score: number | null; size?: number }) {
  return <MiniScoreArc score={score} size={size} label="récup" />;
}
