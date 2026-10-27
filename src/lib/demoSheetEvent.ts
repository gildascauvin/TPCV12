/* Ouverture du lecteur de démos depuis n'importe quelle ligne. Module à part, sans dépendance :
   le lanceur du layout racine l'importe sans embarquer la base de démos ni le parseur. */
export const DEMO_SHEET_EVENT = "tpc-demo-sheet";
export type DemoSheetDetail = { text: string; editable: boolean; anchorY?: number };
/** `anchorY` (position du tap dans la page) : utilisé quand la page est en iframe (/p/ sur WordPress),
    où l'iframe fait toute la hauteur du programme et un lecteur « fixed » s'ouvrirait loin du doigt. */
export function openDemoSheet(text: string, editable: boolean, anchorY?: number) {
  window.dispatchEvent(new CustomEvent<DemoSheetDetail>(DEMO_SHEET_EVENT, { detail: { text, editable, anchorY } }));
}
