import { notFound } from "next/navigation";
import type { Metadata } from "next";
import OTestTool from "./OTestTool";
import { O_TESTS, isOTest } from "@/lib/oTests";

/* Outils de test publics intégrés en iframe dans les pages SEO WordPress (alter ego de /p/[id]).
   Registre : src/lib/oTests.ts ; tout autre segment répond 404. */
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(O_TESTS).map(test => ({ test }));
}

export async function generateMetadata({ params }: { params: Promise<{ test: string }> }): Promise<Metadata> {
  const { test } = await params;
  if (!isOTest(test)) return { title: "ThePerfClub", robots: { index: false } };
  const t = O_TESTS[test];
  return {
    title: `${t.title} | ThePerfClub`,
    description: t.description,
    /* Indexé seulement là où il est intégré (page WordPress), jamais en page autonome. */
    robots: {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true, indexifembedded: true },
    },
  };
}

export default async function PublicTestPage({ params }: { params: Promise<{ test: string }> }) {
  const { test } = await params;
  if (!isOTest(test)) notFound();
  return <OTestTool testKey={test} />;
}
