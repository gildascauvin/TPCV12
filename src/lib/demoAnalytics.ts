import { buildAthleteFixture } from "@/lib/sandboxFixtures";
import { computeConseilsData, type ConseilsData } from "@/lib/conseilsData";
import type { MetricGroup } from "@/lib/metricCards";
import type { Perspective } from "@/lib/fatigueSignature";

/* Données d'exemple pour les onglets Charge/Récupération (2026-09-30, freemium) : tant qu'un compte
   (gratuit OU payant) n'a pas assez d'historique, l'onglet montre un exemple en clair, bien étiqueté,
   plutôt que des indices vides — ou floutés alors qu'il n'y a rien derrière. Même fixture et même
   moteur que la sandbox (buildAthleteFixture → computeConseilsData), aucune donnée inventée à part. */

/* Même seuils que le moteur : ACWR calculable (14 j + 4 séances, voir acuteChronicAt) pour la charge,
   baseline personnelle suffisante (12 j) pour la récupération. */
export function analyticsReady(data: ConseilsData, group: MetricGroup): boolean {
  return group === "charge"
    ? data.loadInfo.label !== "HISTORIQUE INSUFFISANT"
    : !!data.wellnessBaseline?.hasEnoughHistory;
}

export function demoConseilsData(referenceDate: string, perspective: Perspective = "athlete"): ConseilsData {
  const fx = buildAthleteFixture(new Date(referenceDate + "T12:00:00"));
  return computeConseilsData(referenceDate, fx.profile, fx.sessions, Object.values(fx.wellnessByDate), perspective);
}
