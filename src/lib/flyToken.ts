/* Jeton qui part d'un élément et vole jusqu'à un autre (2026-11-06, célébration de la décision) :
   l'écart part du curseur de l'anneau et se pose sur la ligne de la séance qu'il a changée. */
export function flyToken(from: Element, to: Element, text: string, color = "#d44000", land: "right" | "center" = "right", blur = false) {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const tok = document.createElement("span");
  tok.textContent = text;
  Object.assign(tok.style, {
    position: "fixed", left: "0", top: "0", zIndex: "2147483200", pointerEvents: "none", whiteSpace: "nowrap",
    font: "900 12px var(--font-sans, sans-serif)", color: "#fff", background: color, borderRadius: "999px", padding: "5px 10px",
    boxShadow: `0 6px 18px ${color}88`, transition: "transform .55s cubic-bezier(.5,0,.2,1), opacity .25s",
  } as Partial<CSSStyleDeclaration>);
  if (blur) tok.style.filter = "blur(2.5px)";
  document.body.appendChild(tok);
  const w = tok.offsetWidth, h = tok.offsetHeight;
  const x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2;
  const x1 = land === "center" ? b.left + b.width / 2 - w / 2 : b.right - w - 12, y1 = b.top + b.height / 2 - h / 2;
  tok.style.transition = "none";
  tok.style.transform = `translate(${x0}px, ${y0}px) scale(.6)`;
  void tok.offsetWidth;
  tok.style.transition = "transform .55s cubic-bezier(.5,0,.2,1), opacity .25s";
  tok.style.transform = `translate(${x0}px, ${y0 - 8}px) scale(1.1)`;
  window.setTimeout(() => { tok.style.transform = `translate(${x1}px, ${y1}px) scale(.9)`; }, 110);
  window.setTimeout(() => { tok.style.opacity = "0"; }, 700);
  window.setTimeout(() => tok.remove(), 1000);
}
