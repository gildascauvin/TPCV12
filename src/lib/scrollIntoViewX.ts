/* Amène un élément au centre de son conteneur qui défile horizontalement, SANS faire défiler la page
   verticalement (2026-10-04) : scrollIntoView() fait aussi défiler les ancêtres verticaux, d'où un
   saut vers les séances à chaque changement de date sur le Planning. */
export function scrollIntoViewX(el: HTMLElement | null | undefined, behavior: ScrollBehavior = "smooth") {
  if (!el) return;
  let box: HTMLElement | null = el.parentElement;
  while (box) {
    const ox = getComputedStyle(box).overflowX;
    if ((ox === "auto" || ox === "scroll") && box.scrollWidth > box.clientWidth) break;
    box = box.parentElement;
  }
  if (!box) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  box.scrollTo({ left: box.scrollLeft + (r.left - b.left) - (b.width - r.width) / 2, behavior });
}
