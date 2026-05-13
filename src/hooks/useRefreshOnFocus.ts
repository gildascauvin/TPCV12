"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useRefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [router]);
}
