import { notFound } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";

/* Sandbox non authentifiée (2026-08-19) — même shell visuel que (app)/layout.tsx (fond+BottomNav)
   mais AUCUN check auth (contrairement à (app)/layout.tsx qui redirect("/login") sans session) :
   c'est tout le principe de la sandbox, "View Only + interactions → Signup" pour un visiteur
   anonyme. `role` vient du segment d'URL (/sandbox/coach ou /sandbox/athlete, voir brief) — les 2
   seules valeurs valides, tout le reste 404. */
export default function SandboxLayout({ children, params }: { children: React.ReactNode; params: { role: string } }) {
  if (params.role !== "athlete" && params.role !== "coach") notFound();
  const basePath = `/sandbox/${params.role}`;

  return (
    <div className="min-h-screen bg-bg pb-[132px]">
      {children}
      <BottomNav role={params.role} basePath={basePath} />
    </div>
  );
}
