type AthleteParams = {
  mode: "athlete";
  goal: string;
  frustration: string;
};
type CoachParams = {
  mode: "coach";
  coachingContext: string;
  coachingChallenge: string;
};
type PrimingParams = AthleteParams | CoachParams;

const ATHLETE_HEADLINES: Record<string, Record<string, string>> = {
  "Progresser en performance": {
    "Les programmes sont trop rigides, pas adaptés à mon état du jour":
      "Tes programmes ne s'adaptent pas à toi — ThePerfClub ajuste chaque séance à ton état réel pour que tu performes vraiment.",
    "Je ne sais pas quand forcer et quand récupérer":
      "Tu ne sais pas toujours quand pousser — ThePerfClub t'indique exactement quand forcer pour progresser.",
    "Je manque de structure et de suivi":
      "Sans structure claire, les progrès sont lents. ThePerfClub te donne le cadre pour performer.",
    "Je perds du temps sans progresser vraiment":
      "Tu travailles dur mais tu stagnes. ThePerfClub calibre l'intensité qui fait vraiment la différence.",
  },
  "Éviter le surmenage et les blessures": {
    "Les programmes sont trop rigides, pas adaptés à mon état du jour":
      "Des programmes rigides qui ignorent ton état, c'est la recette des blessures. ThePerfClub s'adapte à toi chaque jour.",
    "Je ne sais pas quand forcer et quand récupérer":
      "Ne pas savoir quand forcer, c'est le risque de blessure n°1. ThePerfClub t'indique exactement le bon moment.",
    "Je manque de structure et de suivi":
      "Sans suivi précis, les signaux de fatigue passent inaperçus. ThePerfClub les détecte pour toi.",
    "Je perds du temps sans progresser vraiment":
      "Forcer sans progresser augmente le risque de blessure. ThePerfClub optimise ton rapport charge/récup.",
  },
  "Mieux récupérer entre les séances": {
    "Les programmes sont trop rigides, pas adaptés à mon état du jour":
      "Tes séances ne respectent pas ton état de récupération. ThePerfClub ajuste automatiquement l'intensité.",
    "Je ne sais pas quand forcer et quand récupérer":
      "Savoir quand récupérer, c'est la moitié de la progression. ThePerfClub te guide sur le timing exact.",
    "Je manque de structure et de suivi":
      "Sans suivi, la récupération reste floue. ThePerfClub la rend visible et actionnable chaque jour.",
    "Je perds du temps sans progresser vraiment":
      "Si tu stagnes, c'est peut-être que tu récupères mal. ThePerfClub t'aide à en faire moins pour progresser plus.",
  },
  "Structurer et suivre mon entraînement": {
    "Les programmes sont trop rigides, pas adaptés à mon état du jour":
      "Ton programme ne colle pas à ta réalité. ThePerfClub construit une structure qui s'adapte à toi.",
    "Je ne sais pas quand forcer et quand récupérer":
      "Improviser chaque semaine coûte de l'énergie. ThePerfClub structure ton entraînement selon ton état du jour.",
    "Je manque de structure et de suivi":
      "Tu veux un plan clair qui s'adapte à ton état. C'est exactement ce que ThePerfClub fait.",
    "Je perds du temps sans progresser vraiment":
      "Travailler sans plan qui progresse, c'est frustrant. ThePerfClub te donne la structure pour avancer vraiment.",
  },
};

function getCoachHeadline(context: string, challenge: string): string {
  if (context.startsWith("Kiné")) {
    return "Suis l'évolution de chaque sportif en réhab et identifie qui est en bonne route vers le retour à l'entraînement.";
  }
  if (context.startsWith("Autre")) {
    return "Suivi bien-être, charge, comportements — un tableau de bord complet pour chacun de tes clients.";
  }
  if (challenge.includes("charge") || challenge.includes("Personnaliser")) {
    return "ThePerfClub centralise le niveau de forme et la charge de toute ton équipe en temps réel.";
  }
  if (challenge.includes("programmes") || challenge.includes("outils") || challenge.includes("temps")) {
    return "Génère des programmes sport-spécifiques en quelques clics. Un seul outil pour tout centraliser.";
  }
  if (challenge.includes("Communiquer")) {
    return "Tes sportifs reçoivent leurs séances, toi tu vois leur niveau de forme. Le lien coach-sportif simplifié.";
  }
  return "ThePerfClub te donne une vision complète de chaque sportif pour coacher avec précision.";
}

export function getPrimingHeadline(params: PrimingParams): string {
  if (params.mode === "athlete") {
    return (
      ATHLETE_HEADLINES[params.goal]?.[params.frustration] ??
      "ThePerfClub adapte chaque séance à ton état réel pour que tu progresses sans te blesser."
    );
  }
  return getCoachHeadline(params.coachingContext, params.coachingChallenge);
}
