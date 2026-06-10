import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("programs")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!existing || existing.owner_id !== user.id) {
    return Response.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("programs")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ program: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("programs")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!existing || existing.owner_id !== user.id) {
    return Response.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { error } = await admin.from("programs").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
