"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { DARK_CARD_BG } from "@/lib/theme";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import type { MergedTest, TestResultRow } from "@/lib/testResults";
import type { SubscriptionStatus } from "@/types";

/* Cette page ("Performance" dans la bottom nav) ne porte plus que le suivi de tests physiques
   (2026-09-24, "point 1" — voir POC `poc-coach-context_4.html`) : les sections Charge/Récupération/
   Comportements ont déménagé dans les onglets de l'Accueil (/today, voir HomeAnalyticsSections.tsx +
   TodayClient.tsx), qui en sont désormais l'unique source de rendu. Pas de re-navigation de date
   propre à cette page — TestsPanel affiche l'historique complet des tests, pas une vue par jour. */
const TestsPanel = dynamic(() => import("@/components/tests/TestsPanel"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));

export default function ConseilsClient({ subscriptionStatus, hasActiveCoach, userId, sandboxMode = false, sport = null, sexe = null, poidsKg = null, testsFixture }: { subscriptionStatus: SubscriptionStatus; hasActiveCoach: boolean; userId?: string; sandboxMode?: boolean; sport?: string | null; sexe?: "homme" | "femme" | null; poidsKg?: number | null; testsFixture?: { merged: MergedTest[]; results: TestResultRow[] } }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          role="athlete"
          onAction={() => setPaywallStep("priming")}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}
      {/* Fond sombre plein-page + header sans fond propre — même traitement que TodayClient.tsx
         (voir sa doc pour le détail), "seule cette page (et /today) devient dark". */}
      <div style={{
        background: DARK_CARD_BG,
        minHeight: "100vh",
        marginBottom: -132, paddingBottom: 132,
      }}>
      <CalendarHeader
        mode="title" title="Performance" seamless
        selectedDate={new Date().toISOString().slice(0, 10)}
        onProfileClick={() => setProfileOpen(true)}
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="athlete" />}
      <div className="page-shell">
        {userId ? (
          <TestsPanel
            ownerId={userId} subject={{ subjectUserId: userId }} mergeCoach
            sport={sport} sexe={sexe} poidsKg={poidsKg}
            onEditProfile={() => setProfileOpen(true)}
            onDarkPage
          />
        ) : testsFixture ? (
          <TestsPanel
            ownerId="sandbox-athlete" subject={{ subjectUserId: "sandbox-athlete" }}
            sport={sport} sexe={sexe} poidsKg={poidsKg}
            fixture={testsFixture}
            onDarkPage
          />
        ) : (
          <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, padding: "8px 2px" }}>Le suivi de tests n&apos;est pas disponible en mode démo.</div>
        )}
      </div>
      </div>
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" page="conseils" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
        ) : (
          <PrimingJourneyModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
            onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss}
            athleteSelfId={userId} />
        )
      )}
      {!sandboxMode && paywallStep === "paywall" && (
        <PaywallModal mode="athlete" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
