/* Remonté à chaque changement de page (contrairement au layout) : la nouvelle page apparaît en fondu
   (.tpc-page-in, globals.css). La barre du bas et les hôtes globaux vivent dans le layout, ils ne
   bougent pas. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="tpc-page-in">{children}</div>;
}
