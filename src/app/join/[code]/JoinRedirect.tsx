"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function JoinRedirect({ code, coachName }: { code: string; coachName: string | null }) {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("coach_invite_code", code);
    router.replace("/register?role=athlete");
  }, [code, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f1f0ee" }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", color: "#171b1f", marginBottom: 6 }}>
          {coachName ? `Invitation de ${coachName}` : "Lien d'invitation ThePerfClub"}
        </div>
        <div style={{ fontSize: 14, color: "#62686e" }}>Redirection en cours…</div>
      </div>
    </div>
  );
}
