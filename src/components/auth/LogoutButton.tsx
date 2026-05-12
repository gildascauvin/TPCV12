"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        width: "100%", height: 48, borderRadius: 16,
        border: "1px solid rgba(200,30,30,.22)",
        background: "#fff8f8", color: "#c81e1e",
        fontSize: 14, fontWeight: 700, cursor: "pointer",
        letterSpacing: "-0.01em",
      }}
    >
      Déconnexion
    </button>
  );
}
