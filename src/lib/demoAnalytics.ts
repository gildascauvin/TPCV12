import { type ConseilsData } from "@/lib/conseilsData";
import type { MetricGroup } from "@/lib/metricCards";
import { partialChargeReady } from "@/lib/trainingLoad";

/* Données d'exemple pour les onglets Charge/Récupération (2026-09-30, freemium) : tant qu'un compte
   (gratuit OU payant) n'a pas assez d'historique, l'onglet montre un exemple en clair, bien étiqueté,
   plutôt que des indices vides — ou floutés alors qu'il n'y a rien derrière. Même fixture et même
   moteur que la sandbox (buildAthleteFixture → computeConseilsData), aucune donnée inventée à part. */

/* Même seuils que le moteur : ACWR calculable (14 j + 4 séances, voir acuteChronicAt) pour la charge,
   baseline personnelle suffisante (12 j) pour la récupération — sur N'IMPORTE QUEL jour de la
   période, pas seulement le jour de référence : la baseline du jour n'existe qu'une fois le point forme
   du jour rempli, et un sportif avec des mois d'historique basculait en démo chaque matin avant son
   point forme (bug du 2026-10-01). */
export function analyticsReady(data: ConseilsData, group: MetricGroup): boolean {
  return group === "charge"
    ? data.loadInfo.label !== "HISTORIQUE INSUFFISANT" || partialChargeReady(data.timeSeries)
    : !!data.wellnessBaseline?.hasEnoughHistory || data.wellnessBaselineSeries.some(b => !!b?.hasEnoughHistory)
      // Historique importé de la montre (jours avant l'inscription, 2026-10-23) : 5 jours mesurés suffisent.
      || (data.measuredRecovery ?? []).filter(v => v !== null).length >= 5;
}
