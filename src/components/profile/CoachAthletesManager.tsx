"use client";

import { useEffect, useState } from "react";
import { buildCoachFixture } from "@/lib/sandboxFixtures";
import { Skel } from "@/components/ui/Skeleton";
import { RADIUS } from "@/lib/theme";
import { useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";

/* Onglet "Mes sportifs" du tiroir profil coach (2026-10-04, POC Coach v2) : seul endroit où l'on
   retire un sportif de son groupe, annule une invitation ou supprime un profil sans compte. Remplace
   le menu ⋯ de /coach/athletes (page Performance, qui ne parle plus que de tests). Même route
   qu'avant (/api/athlete/delete). Liste lue avec le client normal : RLS laisse le coach lire ses
   propres lignes coach_athletes. */

type Row = { id: string; name: string; user_id: string | null; invite_email: string | null; email: string | null };

const mono = "var(--font-mono), monospace";

function menuBtn(color: string): React.CSSProperties {
  return { width: "100%", textAlign: "left", border: "none", borderTop: "1px solid rgba(0,0,0,.05)", background: "none", padding: "11px 14px 11px 64px", fontSize: 13, fontWeight: 700, color, cursor: "pointer", fontFamily: "inherit" };
}

function kindOf(a: Row): "active" | "pending" | "demo" {
  if (a.user_id) return "active";
  if (a.invite_email) return "pending";
  return "demo";
}

export default function CoachAthletesManager({ sandboxMode, onSandboxGate, onRemoved }: {
  sandboxMode: boolean;
  onSandboxGate: () => void;
  onRemoved: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(sandboxMode
    ? buildCoachFixture().athletes.map(a => ({ id: a.id, name: a.name, user_id: a.user_id, invite_email: a.invite_email, email: a.invite_email }))
    : null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filterStorage = useCoachAthleteFilterStorage();

  /* Voir sa journée : même sélection persistée que la barre des sportifs, puis Accueil coach. */
  function viewDay(a: Row) {
    filterStorage.write(a.id);
    window.location.href = sandboxMode ? "/sandbox/coach" : "/coach";
  }

  async function resend(a: Row) {
    if (sandboxMode) { onSandboxGate(); return; }
    setBusyId(a.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/invite/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachAthleteId: a.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setNotice(`Invitation renvoyée à ${a.invite_email}.`);
      setMenuId(null);
    } catch (e) {
      setError((e as Error).message || "L'invitation n'a pas pu être renvoyée.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (sandboxMode) return;
    (async () => {
      try {
        const res = await fetch("/api/coach/roster");
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRows(json.athletes as Row[]);
      } catch {
        setError("Impossible de charger tes sportifs.");
        setRows([]);
      }
    })();
  }, [sandboxMode]);

  async function remove(a: Row) {
    if (sandboxMode) { onSandboxGate(); return; }
    setBusyId(a.id);
    setError(null);
    try {
      const res = await fetch("/api/athlete/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachAthleteId: a.id }),
      });
      if (!res.ok) throw new Error();
      setRows(prev => (prev ?? []).filter(r => r.id !== a.id));
      setConfirmId(null);
      setMenuId(null);
      onRemoved();
    } catch {
      setError(`${a.name} n'a pas pu être retiré. Réessaie dans un instant.`);
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skel h={58} r={16} /><Skel h={58} r={16} /><Skel h={58} r={16} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.5, padding: "8px 0" }}>
        Aucun sportif pour l&apos;instant. Invite-en un depuis le bouton « + Inviter » en haut de l&apos;écran.
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.13em", fontFamily: mono, textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
        {rows.length} sportif{rows.length > 1 ? "s" : ""}
      </div>
      {notice && (
        <div style={{ fontSize: 13, color: "#166534", background: "#eafaf0", borderRadius: RADIUS.block, padding: "10px 12px", marginBottom: 12 }}>{notice}</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#b42318", background: "#fef2f2", borderRadius: RADIUS.block, padding: "10px 12px", marginBottom: 12 }}>{error}</div>
      )}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: RADIUS.card, overflow: "hidden", marginBottom: 24 }}>
        {rows.map((a, i) => {
          const kind = kindOf(a);
          const first = a.name.split(" ")[0];
          const initials = a.name.split(" ").map(s => s[0]).join("").toUpperCase().slice(0, 2);
          const status = kind === "active" ? "Compte actif" : kind === "pending" ? "Invitation envoyée" : "Profil sans compte";
          const dot = kind === "active" ? "#2f9e44" : kind === "pending" ? "#f28a00" : "#c3c7cb";
          const action = kind === "active" ? "Retirer de mon groupe" : kind === "pending" ? "Annuler l'invitation" : "Supprimer le profil";
          const confirmText = kind === "active"
            ? <><b style={{ color: "#171b1f" }}>Retirer {first} de ton groupe ?</b> {first} garde son compte, ses séances et son historique. Tu ne verras plus sa journée ni sa forme.</>
            : kind === "pending"
              ? <><b style={{ color: "#171b1f" }}>Annuler l&apos;invitation de {first} ?</b> Le lien reçu à {a.invite_email} ne marchera plus.</>
              : <><b style={{ color: "#171b1f" }}>Supprimer le profil de {first} ?</b> {first} n&apos;a pas de compte : ses séances seront supprimées. Cette action est définitive.</>;
          const confirmLabel = kind === "active" ? "Retirer" : kind === "pending" ? "Annuler l'invitation" : "Supprimer";
          return (
            <div key={a.id} style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,.06)" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "12px 14px" }}>
                <span style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#f04a08,#fb923c)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 11, fontWeight: 600 }}>{initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1, fontSize: 12, color: kind === "pending" ? "#9a6400" : "#8a8f94", minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
                  </div>
                  {a.email && (
                    <div style={{ fontSize: 12, color: "#62686e", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</div>
                  )}
                </div>
                <button
                  onClick={() => { setMenuId(prev => (prev === a.id ? null : a.id)); setConfirmId(null); }}
                  aria-label={`Options pour ${a.name}`}
                  style={{ width: 34, height: 34, borderRadius: RADIUS.control, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.08)", color: "#62686e", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                >⋯</button>
              </div>
              {menuId === a.id && confirmId !== a.id && (
                <div style={{ background: "#fafafa", display: "flex", flexDirection: "column" }}>
                  <button onClick={() => viewDay(a)} style={menuBtn("#171b1f")}>Voir sa journée</button>
                  {kind === "pending" && (
                    <button onClick={() => resend(a)} disabled={busyId === a.id} style={{ ...menuBtn("#171b1f"), opacity: busyId === a.id ? 0.6 : 1 }}>
                      {busyId === a.id ? "Envoi…" : "Renvoyer l'invitation"}
                    </button>
                  )}
                  <button onClick={() => setConfirmId(a.id)} style={menuBtn("#b42318")}>{action}</button>
                </div>
              )}
              {confirmId === a.id && (
                <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", background: "#fef2f2", padding: 14, fontSize: 13.5, lineHeight: 1.5, color: "#3a3f44", display: "flex", flexDirection: "column", gap: 12 }}>
                  <span>{confirmText}</span>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setConfirmId(null); setMenuId(null); }}
                      style={{ borderRadius: RADIUS.control, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontFamily: "inherit" }}
                    >Annuler</button>
                    <button
                      onClick={() => remove(a)}
                      disabled={busyId === a.id}
                      style={{ borderRadius: RADIUS.control, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: "#b42318", color: "#fff", opacity: busyId === a.id ? 0.6 : 1, fontFamily: "inherit" }}
                    >{busyId === a.id ? "..." : confirmLabel}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
