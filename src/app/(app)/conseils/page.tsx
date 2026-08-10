export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getConseilsData } from "@/lib/conseilsData";
import ConseilsClient from "./ConseilsClient";

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const data = await getConseilsData(supabase, user!.id, today);

  return <ConseilsClient initialData={data} />;
}
