import { NextRequest } from "next/server";
import { POST as handleWebhook } from "../route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Même webhook que ../route.ts, avec le jeton dans le chemin (/api/garmin/webhook/<jeton>) :
   l'outil Endpoint Configuration de Garmin retire la query string des URL enregistrées (constaté le
   2026-10-23), donc ?token= n'arrivait jamais. On repasse le jeton en query pour réutiliser le handler. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  url.pathname = "/api/garmin/webhook";
  url.searchParams.set("token", params.token);
  const forwarded = new NextRequest(url, { method: "POST", headers: req.headers, body: await req.text() });
  return handleWebhook(forwarded);
}
