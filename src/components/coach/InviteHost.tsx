"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const InviteModal = dynamic(() => import("@/components/coach/InviteModal"));

/* Invitation ouverte sur place, depuis n'importe quelle page coach (2026-10-04) : « + Inviter » de
   la barre des sportifs, étape « Invite tes sportifs » de la checklist, tiroir de l'activité, carte
   d'invitation du Coach Control. Tous émettent OPEN_INVITE ; ce composant (monté une fois dans le
   layout coach et la sandbox coach) affiche InviteModal. Les pages gardent leurs sportifs en
   state : fermer après une invitation recharge la page. */
export const OPEN_INVITE = "tpc:open-invite";

export function openInvite() {
  window.dispatchEvent(new Event(OPEN_INVITE));
}

export default function InviteHost({ sandboxMode = false }: { sandboxMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    async function onOpen() {
      setOpen(true);
      if (sandboxMode || inviteCode) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("invite_code").eq("user_id", user.id).maybeSingle();
      setInviteCode(data?.invite_code ?? null);
    }
    window.addEventListener(OPEN_INVITE, onOpen);
    return () => window.removeEventListener(OPEN_INVITE, onOpen);
  }, [sandboxMode, inviteCode]);

  if (!open) return null;
  return (
    <InviteModal
      inviteCode={inviteCode}
      sandboxMode={sandboxMode}
      onSent={() => setSent(true)}
      onLinked={() => setSent(true)}
      onClose={() => { if (sent) window.location.reload(); else setOpen(false); }}
    />
  );
}
