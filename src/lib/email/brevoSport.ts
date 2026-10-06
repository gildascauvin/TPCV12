/* Attributs Brevo qui personnalisent les emails selon le sport (2026-10-06) :
   SPORT_PHRASE (« de sprint », « de rugby »… même table que le titre du signup) et SPORT_PHOTO (bandeau
   tiré de la couverture du programme claimé, sinon d'un programme officiel du même sport). Chaîne
   vide = sport inconnu : les templates retombent sur leur texte et leur photo génériques.

   Bandeaux : couvertures recadrées 1200×520 avec fondu vers le fond des emails, déposés une fois dans
   email-assets/emails/sport/{programId}.jpg. Un nouveau programme officiel n'a pas de bandeau tant
   qu'on ne l'a pas généré (repli générique). */
import { sessionsComplement } from "@/lib/sportCategories";
import { SPORT_COVER_PROGRAM } from "@/lib/programCovers";
import { findCatalogEntry } from "@/lib/sportCatalog";

const BANNER_BASE = "https://levplovrwwsqvswmolik.supabase.co/storage/v1/object/public/email-assets/emails/sport/";
const BANNER_IDS = new Set([
  "8fa44a76-3e5b-4d74-96cc-87f28193ab76",
  "09f32cf0-a1ae-4ad6-a75a-3e83e829e8b5",
  "0a631b9f-308e-41f2-aabf-43ee588985b9",
  "0f02a5f6-d538-4d59-8e02-f70cf7df3e07",
  "1a07c4b0-a128-41a6-90fc-99f5cbc73883",
  "1a6275e6-0f4c-448f-8389-0ce8d4bf9151",
  "1aecf396-0712-40b4-bed6-00359bac8839",
  "1df0afcc-6dfd-4c02-aa6e-c150800560f1",
  "2027e936-1a07-4969-b111-a90e4ea39642",
  "23261348-c05a-4dd6-9dc4-bb90566b3c1d",
  "26f9aa29-47b3-4049-9392-b2ee05a69f40",
  "27fe779d-3549-4804-8225-fa24134820fc",
  "2a98ef46-21bb-4702-9fef-751ac2ffcfdb",
  "2aa22e84-1012-42ee-88ab-a4ab70562f3e",
  "2fbc61c9-75dc-4e2d-88a0-ec9bc6ac056d",
  "315fc072-5736-446f-a498-3f274a1d3521",
  "3b6323cb-f400-4c89-80e4-babd5f747478",
  "3e3e6b9d-7bf6-4b01-b526-d0c3765f2fd0",
  "445f233a-4e2c-4632-be76-76826e4d2e20",
  "55d6d90f-f35f-46e3-a81c-9b928a6f432c",
  "568c93ce-6cb8-4034-82c2-61ec0321361e",
  "5bf7b813-d72c-479e-82d8-93d741f46da8",
  "5f688f68-86c1-4ead-a6c4-54ca0249253a",
  "669fad89-1d7e-4c44-8a23-2b99d61fdf6f",
  "698b8601-93ca-4893-886a-5224d3ca1b9a",
  "6d59c644-6964-4475-991d-f72c4f301cdb",
  "6ddca6dd-e97f-4271-b4fc-7b4c63023cad",
  "81c0a4de-be5b-45eb-804d-71150a82367c",
  "8318e4c4-4a69-4b36-9968-bbdbbe830af7",
  "85229876-3756-4554-a02d-8c6103e65081",
  "852e152c-b119-4331-9c6f-15e6047e2db5",
  "8c0b672f-e27d-4510-b15f-6f036ee3336d",
  "8cbb6316-e52f-4fc8-b486-8f6f25f56d48",
  "8df3e3d3-79e8-4cec-95e1-8afcd51330d8",
  "8eaeafc4-b06c-4f9a-a2c2-2a76da690163",
  "9918f6ab-7251-47d4-b50b-6c8732279fb7",
  "a4755f16-c95e-4de6-a2bc-ddda8e887898",
  "a69eb0e9-3239-4d2c-b33c-a3da8872f696",
  "a7a01a22-5875-41bb-a649-c628cdbd678a",
  "aa7d4465-f806-4294-a2cb-96057506daf2",
  "b650acf4-ff30-40c0-8896-619a9c06154b",
  "bab4683e-a599-4c26-908f-5882d328aa54",
  "bd0d3d0b-2240-4227-b84b-fb768459a6a8",
  "c387814e-0122-4707-9b4e-3a11f1d8b5b6",
  "c4a065a9-6721-4c58-a10d-3cb570b013c2",
  "c8304f36-2080-457a-b6eb-4697e56155bd",
  "c84c3ac1-4b3d-4843-8b43-aead44bbbb9b",
  "cdbb46b2-2aff-4293-ba1e-720f4bf30c14",
  "cf81950c-83bf-4c55-8458-60d31624f327",
  "d85c3fff-51df-466c-92cf-54b675fa7ed4",
  "db7745e8-dddb-4181-9e09-2a66f956e7f5",
  "dbb9fcf7-5557-4923-bbfa-d37e718bf413",
  "dc9bb6e1-9884-4b3b-8fc2-e34f71785b3a",
  "dd2beb89-1ea8-48f8-b345-b90d2057198a",
  "e0b3b169-0a85-4ddc-8e18-06687afecb42",
  "e1037e4f-6ee9-407b-b68f-751cc425a25f",
  "e36601b7-759d-4317-88b6-00427b0e50e2",
  "e7a3fa3d-b963-416a-9461-798d49d5ef49",
  "ea957672-faec-4f2f-8aad-a18827eed028",
  "f0ff1a31-910a-451c-9960-8eb368bfbf7d",
  "f262e51c-4298-4fec-8569-de61683a17d6",
  "f45ea844-8ced-4698-98dc-12b22f9c551d",
  "ff91c31e-5ec2-4032-b39a-0e51d3354884",
]);

export function sportBannerUrl(sport: string | null | undefined, claimProgramId?: string | null): string {
  const id = claimProgramId && BANNER_IDS.has(claimProgramId)
    ? claimProgramId
    : SPORT_COVER_PROGRAM[findCatalogEntry(sport)?.value ?? ""];
  return id && BANNER_IDS.has(id) ? `${BANNER_BASE}${id}.jpg` : "";
}

export function brevoSportAttributes(sport: string | null | undefined, claimProgramId?: string | null): Record<string, string> {
  return { SPORT_PHRASE: sessionsComplement(sport) ?? "", SPORT_PHOTO: sportBannerUrl(sport, claimProgramId) };
}
