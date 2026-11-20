import type { KeyboardEvent } from "react";

/* Rend une <div> cliquable utilisable au clavier (Tab, Entrée, Espace) sans changer son style. */
export function pressable(fn?: (() => void) | null) {
  if (!fn) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
  };
}
