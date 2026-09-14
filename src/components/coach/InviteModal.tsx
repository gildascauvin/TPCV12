"use client";

import { useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { WIZARD_BANNER_H } from "@/components/paywall/UnsavedBanner";
/* Mêmes composants que la liste /coach/athletes, réutilisés tels quels (2026-09-14) — exportés
   depuis AthletesClient.tsx pour cet usage précis, déjà le même principe que l'illustration
   pré-signup CoachAthleteRowsPreview (FrisePreviews.tsx) : jamais de ring/statut réinventés à la
   main pour une préview, même avec des données factices. */
import { AthleteRing, athleteStatus } from "@/app/(app)/coach/athletes/AthletesClient";

/* Variété de scores factices (2026-09-14, retour explicite de Gildas — "mets une variété de score
   de forme aux sportifs") : le 1er reste PLACEHOLDER_WELLNESS_SCORE (35, /api/invite/create/
   route.ts — la seule valeur réellement exacte, un tout juste invité n'a que ça), les suivants sont
   illustratifs (même esprit que COACH_ROWS_PREVIEW dans FrisePreviews.tsx, qui varie déjà ses
   scores démo) — juste pour que 2 sportifs tapés à la suite n'affichent pas des cartes identiques.
   Cycle si plus de 3 sportifs sont ajoutés. */
const PREVIEW_SCORES = [35, 62, 85];

interface Props {
  onClose: () => void;
  onLinked: () => void;
  inviteCode?: string | null;
  /* Sandbox uniquement (2026-08-19) : aucun compte coach réel n'existe encore, donc aucune ligne
     coach_invites/coach_athletes ne peut être créée — POST /api/sandbox/invite envoie juste un
     email "comme si le sportif s'était inscrit lui-même" (lien vers /register, pas de lien
     coach↔sportif enregistré, voir la route pour le détail). */
  sandboxMode?: boolean;
  /* Wizard onboarding (2026-09-03) : bande d'habillage (dots + eyebrow + titre + sous-titre)
     injectée au-dessus du titre réel — absent = comportement inchangé (usage in-app). */
  wizardHero?: React.ReactNode;
  /* Wizard onboarding (2026-09-03) : le bouton "Annuler" du 1er écran devient "Me le rappeler plus
     tard" (même mécanisme que le "🔔 Plus tard" de célébration) — absent = "Annuler" inchangé
     (usage in-app). */
  cancelLabel?: string;
  /* Wizard onboarding (2026-09-04) : "←" vers l'étape wizard précédente — absent = pas de bouton
     retour (usage in-app, ce composant n'a jamais eu besoin de reculer d'une étape). */
  onBack?: () => void;
}

interface InviteRow {
  name: string;
  email: string;
}

export default function InviteModal({ onClose, onLinked, inviteCode, sandboxMode = false, wizardHero, cancelLabel = "Annuler", onBack }: Props) {
  const { isMd } = useBreakpoint();
  const heroOnLeft = !!wizardHero && isMd;
  // Prénom + email ensemble, une ligne = un sportif — plus deux blocs déconnectés (un pour
  // nommer, un pour l'email) : l'invitation part et le sportif apparaît immédiatement dans le
  // Coach Control du coach (carte synthétique, prénom réel), en attendant qu'il rejoigne pour
  // de vrai — voir /api/invite/create pour la synchro.
  const [invites, setInvites] = useState<InviteRow[]>([{ name: "", email: "" }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"linked" | "pending" | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const firstEmail = invites[0]?.email ?? "";
  /* Aha réactif (2026-09-14, wizard uniquement — voir wizardHero ci-dessous) : un prénom tapé
     devient immédiatement une carte, avant même l'envoi de l'invitation. */
  const previewNames = invites.map(r => r.name.trim()).filter(Boolean);

  async function handleInvite() {
    const rows = invites.map(r => ({ name: r.name.trim(), email: r.email.trim() })).filter(r => r.email);
    if (!rows.length) return;
    setSaving(true);
    setError(null);
    const endpoint = sandboxMode ? "/api/sandbox/invite" : "/api/invite/create";
    const results = await Promise.all(rows.map(async row => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteEmail: row.email, athleteName: row.name || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, linked: sandboxMode ? false : (json.linked as boolean | undefined), error: json.error as string | undefined };
    }));
    setSaving(false);
    const sent = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);
    setSentCount(sent.length);
    if (sent.length) {
      setResult(sent.some(r => r.linked) ? "linked" : "pending");
      if (sent.some(r => r.linked)) onLinked();
    }
    if (failed.length && !sent.length) {
      setError(failed[0].error || "Une erreur est survenue.");
    } else if (failed.length) {
      setError(`${failed.length} invitation${failed.length > 1 ? "s" : ""} sur ${rows.length} n'${failed.length > 1 ? "ont" : "a"} pas pu être envoyée${failed.length > 1 ? "s" : ""}.`);
    }
  }

  /* Drawer docké à droite sur desktop, plein écran mobile (2026-09-04, même shell que
     ProgramCriteriaModal.tsx/ProgramBuilderModal.tsx — appliqué ici aussi bien pour l'onboarding
     que pour l'usage in-app, demande explicite de Gildas : "onboarding comme inapp"). */
  return (
    <div
      style={{
        position: "fixed", top: wizardHero ? WIZARD_BANNER_H : 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: heroOnLeft ? "flex-start" : (isMd ? "flex-end" : "stretch"),
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {heroOnLeft && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 48px 0", background: "#141414" }}>
          <div style={{ maxWidth: 480, width: "100%" }}>
            {wizardHero}
            {/* Aha réactif (2026-09-14) : chaque prénom tapé à droite fait directement apparaître sa
                carte ici (aucun texte d'accroche tant que la liste est vide, la zone reste juste
                blanche) — même rendu que la ligne /coach/athletes. */}
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              {previewNames.map((name, i) => {
                const previewScore = PREVIEW_SCORES[i % PREVIEW_SCORES.length];
                const status = athleteStatus(previewScore);
                return (
                  <div key={i} style={{ position: "relative", background: "#fff", borderRadius: 20, padding: 14, boxShadow: "0 8px 20px rgba(0,0,0,.18)" }}>
                    {/* Badge "Aperçu" (2026-09-14, retour explicite de Gildas) — le prénom est réel,
                        le score/statut restent factices tant que le sportif n'a pas rempli sa
                        propre forme. */}
                    <span style={{ position: "absolute", top: 8, right: 10, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: "rgba(23,27,31,.08)", color: "#7b7f82", padding: "2px 7px", borderRadius: 999 }}>
                      Aperçu
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <AthleteRing score={previewScore} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 950, color: "#1f2428" }}>{name}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: status.color, marginTop: 2 }}>{status.label}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div style={{
        background: "#fff",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: wizardHero ? `calc(100dvh - ${WIZARD_BANNER_H}px)` : "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {/* Hero déplacé DANS la zone scrollable sur mobile (2026-09-08) — voir ProgramCreatePicker.tsx.
              Marge basse retirée (2026-09-14) : la bande live doit être directement accolée au hero
              (même fond dark, aucun écart blanc entre les deux) — l'espacement avant le formulaire
              est désormais porté par la bande elle-même. */}
          {wizardHero && !isMd && <div style={{ margin: "-28px -28px 0" }}>{wizardHero}</div>}
          {/* Aha réactif mobile (2026-09-14) : mêmes cartes que le hero desktop (AthleteRing/
              athleteStatus réels, pas de ring réinventé), en pastilles horizontales scrollables.
              Retiré de position:sticky (retour explicite de Gildas — ligne blanche parasite au
              scroll, probable seam de rendu sticky+backdropFilter du drawer) : reste en flux
              normal, collée directement au header. Écart du dessus = padding-bottom de WizardHero
              seul, comme les autres pages. Espace avant le formulaire = margin-bottom 20px
              ("standard aux autres pages", même valeur que ProgramAssignModal.tsx/etc.) +
              padding-bottom 14 (dark) pour ne pas coller la bande à la frontière dark/form. Masqué
              tant qu'aucun prénom n'est tapé (rien à montrer, pas de bande vide). */}
          {wizardHero && !isMd && previewNames.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -28px 20px", padding: "0 28px 14px", background: "#141414" }}>
              {previewNames.map((name, i) => {
                const previewScore = PREVIEW_SCORES[i % PREVIEW_SCORES.length];
                const status = athleteStatus(previewScore);
                return (
                  <div key={i} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 999, padding: "4px 14px 4px 4px" }}>
                    <AthleteRing score={previewScore} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: status.color, whiteSpace: "nowrap" }}>{status.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        {result ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>{result === "linked" ? "🔗" : "✅"}</div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>
              {sentCount > 1 ? "Invitations enregistrées !" : result === "linked" ? "Sportif lié !" : "Invitation enregistrée !"}
            </div>
            <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.6, marginBottom: 24 }}>
              {sandboxMode
                ? (sentCount > 1
                    ? <>Tes <strong style={{ color: "#171b1f" }}>{sentCount} sportifs</strong> viennent de recevoir un lien pour créer leur compte.</>
                    : <><strong style={{ color: "#171b1f" }}>{firstEmail}</strong> vient de recevoir un lien pour créer son compte.</>)
                : sentCount > 1
                ? <>Tu peux déjà créer des séances et un programme pour tes <strong style={{ color: "#171b1f" }}>{sentCount} sportifs</strong>. Tout se synchronisera automatiquement dès qu&apos;ils créeront leur compte.</>
                : result === "linked"
                ? <><strong style={{ color: "#171b1f" }}>{firstEmail}</strong> avait déjà un compte, il est maintenant lié à ton espace.</>
                : <>Tu peux déjà créer des séances et un programme pour <strong style={{ color: "#171b1f" }}>{firstEmail}</strong>. Tout se synchronisera automatiquement dès qu&apos;il créera son compte.</>
              }
            </div>
            <button
              onClick={onClose}
              style={{ width: "100%", height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {onBack && <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 20, padding: "4px 6px", borderRadius: 8, flexShrink: 0, marginLeft: -6 }}>←</button>}
              <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f" }}>
                Inviter un sportif
              </div>
            </div>

            {/* Lien d'invitation */}
            {inviteCode && (
              <div style={{ background: "rgba(212,64,0,.05)", border: "1.5px solid rgba(212,64,0,.18)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#d44000", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                  Lien d'invitation
                </div>
                <div style={{ fontSize: 12, color: "#d44000", fontWeight: 700, wordBreak: "break-all" as const, marginBottom: 10 }}>
                  go.theperfclub.com/join/{inviteCode}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2500);
                    }}
                    style={{ flex: 1, height: 38, borderRadius: 11, background: linkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "background .2s" }}
                  >
                    {linkCopied ? "✓ Copié !" : "📋 Copier le lien"}
                  </button>
                  <button
                    onClick={() => {
                      const msg = encodeURIComponent(`Salut ! Je viens de m'inscrire sur ThePerfClub pour suivre notre entraînement. Rejoins mon espace ici : https://go.theperfclub.com/join/${inviteCode}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                    }}
                    style={{ height: 38, paddingLeft: 14, paddingRight: 14, borderRadius: 11, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 18, cursor: "pointer" }}
                  >
                    📲
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, marginBottom: 14 }}>
              {sandboxMode
                ? "Il recevra un email avec un lien pour créer son compte."
                : "Ou invite par email — le sportif sera lié dès qu'il créera son compte."}
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8f94", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 7 }}>
              Sportif à inviter
            </div>

            {invites.map((invite, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  value={invite.name}
                  onChange={e => setInvites(arr => arr.map((v, idx) => idx === i ? { ...v, name: e.target.value } : v))}
                  onKeyDown={e => e.key === "Enter" && invite.email.trim() && handleInvite()}
                  placeholder="Prénom"
                  autoFocus={i === 0}
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box" as const, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                />
                <input
                  type="email"
                  value={invite.email}
                  onChange={e => setInvites(arr => arr.map((v, idx) => idx === i ? { ...v, email: e.target.value } : v))}
                  onKeyDown={e => e.key === "Enter" && invite.email.trim() && handleInvite()}
                  placeholder="sportif@exemple.com"
                  style={{ flex: 1.4, minWidth: 0, boxSizing: "border-box" as const, background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                />
                {invites.length > 1 && (
                  <button
                    onClick={() => setInvites(arr => arr.filter((_, idx) => idx !== i))}
                    style={{ width: 40, flexShrink: 0, borderRadius: 14, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#8a8f94", fontSize: 16, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={() => setInvites(arr => [...arr, { name: "", email: "" }])}
              style={{ background: "none", border: "none", color: "#d44000", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}
            >
              + Inviter un autre sportif
            </button>
          </>
        )}
        </div>
        {/* CTA sticky (2026-09-02, demande explicite de Gildas) — footer non-scrollable, même
            convention que ProgramCriteriaModal.tsx/ProgramBuilderModal.tsx : les 2 boutons restent
            toujours visibles/accessibles même si la liste de sportifs à inviter s'allonge. */}
        {!result && (
          <div style={{ flexShrink: 0, padding: "16px 28px 20px", background: "#fff", borderTop: "1px solid rgba(0,0,0,.06)", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={handleInvite}
              style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", opacity: saving || !invites.some(r => r.email.trim()) ? 0.6 : 1 }}
            >
              {saving ? "Vérification…" : "Ajouter et inviter →"}
            </button>

            <button
              onClick={onClose}
              style={{ width: "100%", height: 44, borderRadius: 14, background: "none", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              {cancelLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
