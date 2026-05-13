"use client";

import { useState, useEffect } from "react";

export function useBreakpoint() {
  const [w, setW] = useState(390);
  useEffect(() => {
    setW(window.innerWidth);
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMd: w >= 640, isLg: w >= 1024, w };
}
