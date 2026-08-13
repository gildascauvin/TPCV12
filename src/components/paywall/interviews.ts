/* Captures des interviews ThePerfCast — utilisées comme preuve sociale sur paywall_priming
   (carousel "Les experts en parlent", role-aware). Photos stockées dans public/testimonials/,
   compressées depuis les captures d'écran fournies par Gildas. `personas` : rôles pour lesquels
   cette personne est une preuve pertinente — certains coachs sont aussi sportifs eux-mêmes
   (pratiquants haut niveau dans leur discipline), donc apparaissent dans les deux carousels. */

export interface Interview {
  slug: string;
  name: string;
  role: string;
  personas: ("athlete" | "coach")[];
}

export const INTERVIEWS: Interview[] = [
  { slug: "corentin-lecomte", name: "Corentin Lecomte", role: "Athlète Athlétisme · Sprint 400m", personas: ["athlete"] },
  { slug: "jean-christophe-cadeac", name: "Jean-Christophe Cadeac", role: "Owner salle de CrossFit", personas: ["athlete", "coach"] },
  { slug: "thibault-ferreira-cortes", name: "Thibault Ferreira Cortès", role: "Haltérophilie · @cortes_blacklifter", personas: ["athlete", "coach"] },
  { slug: "rudy-coia", name: "Rudy Coia", role: "Fondateur SuperPhysique.org", personas: ["athlete", "coach"] },
  { slug: "antoine-serpe", name: "Antoine Serpe", role: "Strongman & Handball · @labarbede_sparte", personas: ["athlete", "coach"] },
  { slug: "jeremie-bourguet", name: "Jérémie Bourguet", role: "Entraîneur karaté", personas: ["athlete", "coach"] },
  { slug: "antoine-pirovano", name: "Antoine Pirovano", role: "Fondateur Deeptimize.com", personas: ["coach"] },
  { slug: "antony-debordes", name: "Antony Debordes", role: "Fondateur Holistic Academy", personas: ["coach"] },
  { slug: "mathieu-rohr", name: "Mathieu Rohr", role: "Personal Trainer", personas: ["coach"] },
  { slug: "ken-porchet", name: "Ken Porchet", role: "Fondateur Fundamentals", personas: ["coach"] },
  { slug: "antoine-limousi", name: "Antoine Limousi", role: "Préparateur physique · Pôle Espoir Baseball", personas: ["coach"] },
  { slug: "gael-faury", name: "Gaël Faury", role: "Préparateur physique · Spécialiste VTT", personas: ["coach"] },
  { slug: "antoine-fournot", name: "Antoine Fournot", role: "Préparateur physique · Étoiles 92", personas: ["coach"] },
  { slug: "thomas-lebegue", name: "Thomas Lebegue", role: "Prépa physique · OM Féminines", personas: ["coach"] },
  { slug: "thomas-grondin", name: "Thomas Grondin", role: "Préparateur physique · Handball", personas: ["coach"] },
];
