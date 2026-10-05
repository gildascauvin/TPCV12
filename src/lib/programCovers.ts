/* Image de couverture des programmes officiels, reprise de leur page WordPress (photo du hero de
   la page programme, taille d'origine). Pas de colonne en base : liste figée, extraite le
   2026-10-03 des articles theperfclub.com/programme-* via l'API WP (iframe /p/{id} → image du
   hero). À compléter à la main si un nouveau programme officiel a sa page. */
const PROGRAM_COVERS: Record<string, string> = {
  "e36601b7-759d-4317-88b6-00427b0e50e2": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-BMX-.jpg", // programme-bmx-preparation-physique-8-semaines
  "669fad89-1d7e-4c44-8a23-2b99d61fdf6f": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-Voile.jpg", // programme-voile-preparation-physique-8-semaines
  "8eaeafc4-b06c-4f9a-a2c2-2a76da690163": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-Baseball.jpg", // programme-baseball-preparation-physique-8-semaines
  "27fe779d-3549-4804-8225-fa24134820fc": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-Hockey-sur-Glace.jpg", // programme-hockey-sur-glace-preparation-physique-8-semaines
  "dd2beb89-1ea8-48f8-b345-b90d2057198a": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-Equitation.jpg", // programme-equitation-preparation-physique-8-semaines
  "f0ff1a31-910a-451c-9960-8eb368bfbf7d": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-Pliometrie.jpg", // programme-pliometrie-explosivite-8-semaines
  "cdbb46b2-2aff-4293-ba1e-720f4bf30c14": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-golf.jpg", // programme-golf-preparation-physique-8-semaines
  "ea957672-faec-4f2f-8aad-a18827eed028": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-preparation-GIGN.jpg", // programme-preparation-selection-gign-8-semaines
  "a7a01a22-5875-41bb-a649-c628cdbd678a": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-concours-police-nationale.jpg", // programme-preparation-concours-police-nationale-8-semaines
  "1df0afcc-6dfd-4c02-aa6e-c150800560f1": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-concours-armee-de-terre.jpg", // programme-preparation-tap-armee-de-terre-8-semaines
  "23261348-c05a-4dd6-9dc4-bb90566b3c1d": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-concours-pompier.jpg", // programme-preparation-concours-sapeur-pompier-8-semaines
  "c387814e-0122-4707-9b4e-3a11f1d8b5b6": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-concours-gendarmerie.jpg", // programme-preparation-concours-gendarmerie-8-semaines
  "26f9aa29-47b3-4049-9392-b2ee05a69f40": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-escalade.jpg", // programme-escalade-preparation-physique-8-semaines
  "445f233a-4e2c-4632-be76-76826e4d2e20": "https://www.theperfclub.com/wp-content/uploads/2026/08/programme-boxe.jpg", // programme-boxe-preparation-physique-8-semaines
  "3e3e6b9d-7bf6-4b01-b526-d0c3765f2fd0": "https://www.theperfclub.com/wp-content/uploads/2026/08/Programme-volleyball.jpg", // programme-volleyball-preparation-physique-8-semaines
  "f262e51c-4298-4fec-8569-de61683a17d6": "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby.png", // programme-rugby-preparation-physique-8-semaines
  "dc9bb6e1-9884-4b3b-8fc2-e34f71785b3a": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-physique-gymnastique-scaled.jpg", // programme-gymnastique-preparation-physique-6-semaines
  "aa7d4465-f806-4294-a2cb-96057506daf2": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-prepa-physique-aviron-scaled.jpg", // programme-aviron-preparation-physique-6-semaines
  "568c93ce-6cb8-4034-82c2-61ec0321361e": "https://www.theperfclub.com/wp-content/uploads/2022/05/handball-psg-scaled.jpg", // programme-handball-preparation-physique-8-semaines
  "8fa44a76-3e5b-4d74-96cc-87f28193ab76": "https://www.theperfclub.com/wp-content/uploads/2021/09/gestion-charge-entraînement-équipe.png", // programme-basketball-preparation-physique-8-semaines
  "cf81950c-83bf-4c55-8458-60d31624f327": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-preparation-physique-MMA-scaled.jpg", // programme-mma-preparation-physique-8-semaines
  "8c0b672f-e27d-4510-b15f-6f036ee3336d": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-entrainement-judo-scaled.jpg", // programme-judo-preparation-physique-6-semaines
  "f45ea844-8ced-4698-98dc-12b22f9c551d": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-dentrainement-natation-nage-scaled.jpg", // programme-natation-preparation-physique-6-semaines
  "0f02a5f6-d538-4d59-8e02-f70cf7df3e07": "https://www.theperfclub.com/wp-content/uploads/2026/07/programme-entrainement-ski-scaled.jpg", // programme-ski-preparation-physique-6-semaines
  "dbb9fcf7-5557-4923-bbfa-d37e718bf413": "https://www.theperfclub.com/wp-content/uploads/2026/06/Entrainement-cyclisme-scaled.jpg", // programme-velo-endurance-puissance-6-semaines
  "b650acf4-ff30-40c0-8896-619a9c06154b": "https://www.theperfclub.com/wp-content/uploads/2026/06/trail-running-scaled.jpg", // programme-trail-preparation-physique-8-semaines
  "315fc072-5736-446f-a498-3f274a1d3521": "https://www.theperfclub.com/wp-content/uploads/2025/10/guerir-dune-periostite.jpg", // programme-periostite-tibiale-retour-a-la-course-6-semaines
  "a69eb0e9-3239-4d2c-b33c-a3da8872f696": "https://www.theperfclub.com/wp-content/uploads/2026/06/pexels-towfiqu-barbhuiya-3440682-13716991-scaled.jpg", // programme-tendon-achille-renforcement-8-semaines
  "09f32cf0-a1ae-4ad6-a75a-3e83e829e8b5": "https://www.theperfclub.com/wp-content/uploads/2026/06/entorse-cheville-reeducation-scaled.jpg", // programme-cheville-renforcement-post-entorse-6-semaines
  "e7a3fa3d-b963-416a-9461-798d49d5ef49": "https://www.theperfclub.com/wp-content/uploads/2026/06/syndrome-rotulien-scaled.jpg", // programme-syndrome-rotulien-renforcement-6-semaines
  "8318e4c4-4a69-4b36-9968-bbdbbe830af7": "https://www.theperfclub.com/wp-content/uploads/2024/03/sentrainer-dans-la-douleur-scaled.jpg", // programme-lombalgie-renforcement-lombaire-6-semaines
  "852e152c-b119-4331-9c6f-15e6047e2db5": "https://www.theperfclub.com/wp-content/uploads/2024/12/Etirement-des-epaules-et-prevention-des-blessures-scaled.jpg", // programme-coiffe-des-rotateurs-renforcement-6-semaines
  "2fbc61c9-75dc-4e2d-88a0-ec9bc6ac056d": "https://www.theperfclub.com/wp-content/uploads/2021/01/Entrai%CC%82nement-en-force-pour-athle%CC%80tes-dendurance.jpeg", // programme-triathlon-preparation-12-semaines
  "c84c3ac1-4b3d-4843-8b43-aead44bbbb9b": "https://www.theperfclub.com/wp-content/uploads/2020/12/hqdefault-2xFHMV.jpeg", // programme-arrache-snatch-specialisation-4-semaines
  "1a07c4b0-a128-41a6-90fc-99f5cbc73883": "https://www.theperfclub.com/wp-content/uploads/2023/10/etirements-pendant-les-jours-de-recuperation-scaled.jpg", // programme-mobilite-et-flexibilite-6-semaines
  "8df3e3d3-79e8-4cec-95e1-8afcd51330d8": "https://www.theperfclub.com/wp-content/uploads/2026/06/preparation-physique-football-scaled.jpg", // programme-football-preparation-physique-8-semaines
  "2aa22e84-1012-42ee-88ab-a4ab70562f3e": "https://www.theperfclub.com/wp-content/uploads/2026/06/Preparation-physique-padel-scaled.jpg", // programme-padel-preparation-physique-6-semaines
  "3b6323cb-f400-4c89-80e4-babd5f747478": "https://www.theperfclub.com/wp-content/uploads/2024/02/concevez-votre-planification-dentrainement-scaled.jpg", // programme-calisthenics-tractions-et-force-8-semaines
  "2a98ef46-21bb-4702-9fef-751ac2ffcfdb": "https://www.theperfclub.com/wp-content/uploads/2024/04/recuperation-sportive-avec-le-sommeil-et-lalimentation-scaled.jpg", // programme-perte-de-poids-recomposition-corporelle-8-semaines
  "9918f6ab-7251-47d4-b50b-6c8732279fb7": "https://www.theperfclub.com/wp-content/uploads/2020/12/prise-de-masse.jpeg", // programme-hypertrophie-prise-de-masse-8-semaines
  "c8304f36-2080-457a-b6eb-4697e56155bd": "https://www.theperfclub.com/wp-content/uploads/2020/12/hqdefault-im4q4F.jpeg", // programme-deadlift-specialisation-6-semaines
  "db7745e8-dddb-4181-9e09-2a66f956e7f5": "https://www.theperfclub.com/wp-content/uploads/2026/06/programme-developpe-couche-scaled.jpg", // programme-bench-press-specialisation-6-semaines
  "a4755f16-c95e-4de6-a2bc-ddda8e887898": "https://www.theperfclub.com/wp-content/uploads/2024/07/le-guide-complet-pour-ameliorer-vos-squats-1.jpg", // programme-squat-specialisation-6-semaines
  "55d6d90f-f35f-46e3-a81c-9b928a6f432c": "https://www.theperfclub.com/wp-content/uploads/2024/04/Powerlifting-logiciels-pour-coach-sportifs-et-RPE-scaled.jpg", // programme-powerlifting-squat-bench-deadlift-8-semaines
  "6d59c644-6964-4475-991d-f72c4f301cdb": "https://www.theperfclub.com/wp-content/uploads/2023/11/prevenir-les-blessures-dans-le-sport.jpg", // programme-saut-longueur-hauteur-athletisme-8-semaines
  "c4a065a9-6721-4c58-a10d-3cb570b013c2": "https://www.theperfclub.com/wp-content/uploads/2026/06/programme-dentrainement-pour-le-tennis-scaled.jpg", // programme-tennis-preparation-physique-6-semaines
  "1a6275e6-0f4c-448f-8389-0ce8d4bf9151": "https://www.theperfclub.com/wp-content/uploads/2023/08/repetitions-en-musculation.jpg", // programme-sport-combat-conditioning-6-semaines
  "8cbb6316-e52f-4fc8-b486-8f6f25f56d48": "https://www.theperfclub.com/wp-content/uploads/2023/09/La-musculation-pour-les-athletes-dendurance-feminines-scaled.jpg", // programme-marathon-16-semaines
  "5f688f68-86c1-4ead-a6c4-54ca0249253a": "https://www.theperfclub.com/wp-content/uploads/2023/09/La-musculation-pour-les-athletes-dendurance-feminines-scaled.jpg", // programme-semi-marathon-12-semaines
  "1aecf396-0712-40b4-bed6-00359bac8839": "https://www.theperfclub.com/wp-content/uploads/2023/11/base-aerobie-pour-lendurance-scaled.jpg", // programme-10k-8-semaines
  "698b8601-93ca-4893-886a-5224d3ca1b9a": "https://www.theperfclub.com/wp-content/uploads/2026/06/Capture-decran-2026-06-02-a-3.40.48-PM.jpg", // programme-crossfit-base-8-semaines
  "2027e936-1a07-4969-b111-a90e4ea39642": "https://www.theperfclub.com/wp-content/uploads/2025/02/Seance-dentrainement-en-WOD-ou-en-Hyrox-scaled.jpg", // programme-hyrox-preparation-competition-8-semaines
  "e1037e4f-6ee9-407b-b68f-751cc425a25f": "https://www.theperfclub.com/wp-content/uploads/2026/05/Sprint-et-musculation-scaled.jpg", // programme-sprint-developpement-complet-8-semaines
  "e0b3b169-0a85-4ddc-8e18-06687afecb42": "https://www.theperfclub.com/wp-content/uploads/2026/05/Sprint-et-musculation-scaled.jpg", // programme-puissance-explosivite-6-semaines
  "bab4683e-a599-4c26-908f-5882d328aa54": "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby.png", // programme-sport-collectif-preparation-physique-8-semaines
  "bd0d3d0b-2240-4227-b84b-fb768459a6a8": "https://www.theperfclub.com/wp-content/uploads/2021/03/halte%CC%81rophilie-Thibault-cortes.png", // programme-halterophilie-4-jours-4-semaines
  "85229876-3756-4554-a02d-8c6103e65081": "https://www.theperfclub.com/wp-content/uploads/2021/01/RPE-et-ve%CC%81locite%CC%81.jpeg", // programme-musculation-par-rpe-4-semaines
  "ff91c31e-5ec2-4032-b39a-0e51d3354884": "https://www.theperfclub.com/wp-content/uploads/2024/06/valgus-des-genoux-et-squat-scaled.jpg", // programme-corriger-valgus-du-genou-6-semaines
  "81c0a4de-be5b-45eb-804d-71150a82367c": "https://www.theperfclub.com/wp-content/uploads/2023/02/tendons-et-ligaments-les-renforcer-scaled.jpg", // programme-renforcement-tendons-ligaments-6-semaines
  "5bf7b813-d72c-479e-82d8-93d741f46da8": "https://www.theperfclub.com/wp-content/uploads/2020/12/photo-1541534741688-6078c6bfb5c5.jpeg", // programme-cross-training-8-semaines-athlete-complet
  "0a631b9f-308e-41f2-aabf-43ee588985b9": "https://www.theperfclub.com/wp-content/uploads/2025/06/Periodisation-en-sprint.jpg", // programme-sprint-athletisme-periodisation-8-semaines
  "6ddca6dd-e97f-4271-b4fc-7b4c63023cad": "https://www.theperfclub.com/wp-content/uploads/2020/12/pexels-photo-2803158.jpeg", // programme-zone-2-course-a-pied-debutant-6-semaines
  "d85c3fff-51df-466c-92cf-54b675fa7ed4": "https://www.theperfclub.com/wp-content/uploads/2020/12/hqdefault-2xFHMV.jpeg", // programme-halterophilie-avance-4-semaines
};

export const DEFAULT_ONBOARDING_COVER = "https://www.theperfclub.com/wp-content/uploads/2026/07/value-intro-BG.jpeg";

export function programCover(programId: string | null | undefined): string | null {
  return programId ? PROGRAM_COVERS[programId] ?? null : null;
}

/* Fond des questions post-signup selon le sport choisi (valeur du catalogue sportCatalog.ts) : la
   couverture d'un programme officiel de ce sport. Rééducation et concours : le programme de la zone
   ou du concours. Absent = image par défaut. */
const SPORT_COVER_PROGRAM: Record<string, string> = {
  "Haltérophilie": "bd0d3d0b-2240-4227-b84b-fb768459a6a8",
  "Powerlifting": "55d6d90f-f35f-46e3-a81c-9b928a6f432c",
  "Musculation / Hypertrophie": "9918f6ab-7251-47d4-b50b-6c8732279fb7",
  "Calisthenics": "3b6323cb-f400-4c89-80e4-babd5f747478",
  "Puissance & explosivité": "e0b3b169-0a85-4ddc-8e18-06687afecb42",
  "Pliométrie": "f0ff1a31-910a-451c-9960-8eb368bfbf7d",
  "Perte de poids": "2a98ef46-21bb-4702-9fef-751ac2ffcfdb",
  "Fitness / CrossFit": "2027e936-1a07-4969-b111-a90e4ea39642",
  "Hyrox": "2027e936-1a07-4969-b111-a90e4ea39642",
  "Endurance": "1aecf396-0712-40b4-bed6-00359bac8839",
  "Trail": "b650acf4-ff30-40c0-8896-619a9c06154b",
  "Triathlon": "2fbc61c9-75dc-4e2d-88a0-ec9bc6ac056d",
  "Vélo / Cyclisme": "dbb9fcf7-5557-4923-bbfa-d37e718bf413",
  "Natation": "f45ea844-8ced-4698-98dc-12b22f9c551d",
  "Aviron": "aa7d4465-f806-4294-a2cb-96057506daf2",
  "Ski": "0f02a5f6-d538-4d59-8e02-f70cf7df3e07",
  "Athlétisme & vitesse": "e1037e4f-6ee9-407b-b68f-751cc425a25f",
  "Athlétisme — Sauts": "6d59c644-6964-4475-991d-f72c4f301cdb",
  "Sports collectifs": "8df3e3d3-79e8-4cec-95e1-8afcd51330d8",
  "Hockey sur glace": "27fe779d-3549-4804-8225-fa24134820fc",
  "Baseball": "8eaeafc4-b06c-4f9a-a2c2-2a76da690163",
  "Arts martiaux & combat": "445f233a-4e2c-4632-be76-76826e4d2e20",
  "Escalade": "26f9aa29-47b3-4049-9392-b2ee05a69f40",
  "Golf": "cdbb46b2-2aff-4293-ba1e-720f4bf30c14",
  "Voile": "669fad89-1d7e-4c44-8a23-2b99d61fdf6f",
  "BMX": "e36601b7-759d-4317-88b6-00427b0e50e2",
  "Équitation": "dd2beb89-1ea8-48f8-b345-b90d2057198a",
  "Gymnastique": "dc9bb6e1-9884-4b3b-8fc2-e34f71785b3a",
  "Prevention/Reeducation — Cheville": "09f32cf0-a1ae-4ad6-a75a-3e83e829e8b5",
  "Prevention/Reeducation — Genou": "ff91c31e-5ec2-4032-b39a-0e51d3354884",
  "Prevention/Reeducation — Genou LCA": "ff91c31e-5ec2-4032-b39a-0e51d3354884",
  "Prevention/Reeducation — Genou Rotulien": "e7a3fa3d-b963-416a-9461-798d49d5ef49",
  "Prevention/Reeducation — Lombaire": "8318e4c4-4a69-4b36-9968-bbdbbe830af7",
  "Prevention/Reeducation — Épaule": "852e152c-b119-4331-9c6f-15e6047e2db5",
  "Prevention/Reeducation — Tendon Achille": "a69eb0e9-3239-4d2c-b33c-a3da8872f696",
  "Prevention/Reeducation — Périostite": "315fc072-5736-446f-a498-3f274a1d3521",
  "Police Nationale": "a7a01a22-5875-41bb-a649-c628cdbd678a",
  "Gendarmerie": "c387814e-0122-4707-9b4e-3a11f1d8b5b6",
  "Sapeur-Pompier": "23261348-c05a-4dd6-9dc4-bb90566b3c1d",
  "GIGN": "ea957672-faec-4f2f-8aad-a18827eed028",
  "Armée de Terre — TAP": "1df0afcc-6dfd-4c02-aa6e-c150800560f1",
};

export function sportCover(sportValue: string | null | undefined): string | null {
  return sportValue ? programCover(SPORT_COVER_PROGRAM[sportValue]) : null;
}
