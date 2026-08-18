"use client";

import { useEffect, useRef, useState } from "react";
import {
  type TokenSuggestion, type TokenType, TOKEN_RE,
  generateSuggestions, generateSuggestionsClickMode, getCurrentToken, getClickToken, resolveExerciseName, findNameSpans,
} from "@/lib/exerciseAutocomplete";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExerciseAttachments, ExerciseComment } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

async function uploadExerciseVideo(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Vidéo trop lourde (50 Mo max).");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ext = file.name.split(".").pop() || "mp4";
  const path = `${user?.id ?? "anon"}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("exercise-comments").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("exercise-comments").getPublicUrl(path);
  return data.publicUrl;
}

/* Bibliothèque vidéo par nom d'exercice (token "nom", pas la ligne entière — les séries/charges
   changent à chaque occurrence, le nom seul est stable). Une bibliothèque par personne authentifiée
   (RLS auth.uid() = owner_id) — coach ou sportif en auto-édition. */
async function lookupLibraryVideo(name: string): Promise<string | null> {
  const supabase = createClient();
  const key = name.trim().toLowerCase();
  const { data } = await supabase
    .from("exercise_video_library")
    .select("video_url")
    .eq("exercise_name_key", key)
    .maybeSingle();
  return data?.video_url ?? null;
}

async function saveLibraryVideo(name: string, url: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const key = name.trim().toLowerCase();
  await supabase.from("exercise_video_library").upsert(
    { owner_id: user.id, exercise_name: name.trim(), exercise_name_key: key, video_url: url },
    { onConflict: "owner_id,exercise_name_key" }
  );
}

/* Retirer une vidéo de la ligne doit aussi la retirer de la bibliothèque par nom — sinon elle
   réapparaît silencieusement (auto-remplissage) au prochain montage d'une ligne du même nom. */
async function deleteLibraryVideo(name: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const key = name.trim().toLowerCase();
  await supabase.from("exercise_video_library").delete().eq("owner_id", user.id).eq("exercise_name_key", key);
}

/* Éditeur de séance façon Notion — remplace ExerciseGhostEditor dans AddSessionModal/CoachSessionModal.
   `value`/`onChange` restent du texte simple `\n`-séparé (même format que sessions.notes partout
   ailleurs) : chaque ligne devient une mini-carte à la validation (Entrée), avec autocomplete
   token-aware identique à l'ancien éditeur. Vidéo/photo/commentaires par ligne sont conservés par
   l'id client de la ligne (stable au drag & drop), disponibles dès la frappe — même avant le tout
   premier "Enregistrer" — et remontés au parent via `onMediaChange` (état local, sérialisé en
   `exercise_media` par le parent au moment de la sauvegarde, comme le reste du formulaire). */

const AC_BADGE_LABEL: Record<TokenType, string> = { name: "Exercice", volume: "Volume", intensity: "Intensité", constraint: "Contrainte" };
const AC_BADGE_STYLE: Record<TokenType, React.CSSProperties> = {
  name: { background: "#EBF5FB", color: "#2980B9" },
  volume: { background: "#F5EEF8", color: "#8E44AD" },
  intensity: { background: "#FEF0E8", color: "#d44000" },
  constraint: { background: "#E8F8F5", color: "#1abc9c" },
};

interface AcState {
  suggestions: TokenSuggestion[];
  selectedIdx: number;
  replaceStart: number | null;
  replaceEnd: number | null;
  rect: DOMRect;
}

/* Décalage du bas de l'écran occupé par le clavier virtuel (mobile) — technique standard via
   visualViewport (window.innerHeight ne change pas quand le clavier s'ouvre, visualViewport.height
   si). Permet au sheet de rester posé juste au-dessus du clavier plutôt que caché dessous ou
   superposé par-dessus. Fallback à 0 si visualViewport n'existe pas (navigateurs anciens). */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) { setInset(0); return; }
    const vv = window.visualViewport;
    function update() {
      setInset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [active]);
  return inset;
}

/* Panneau de suggestions — remplace AcDropdown. Deux présentations du même contenu :
   - Desktop : ancré juste sous (ou au-dessus si pas de place) le champ/token concerné, comme
     l'ancien AcDropdown — jamais superposé au champ, jamais au-dessus du contenu tapé.
   - Mobile : vrai bottom sheet, fixé au bas du viewport visuel (au-dessus du clavier s'il est
     ouvert, voir useKeyboardInset) — n'ouvre jamais le clavier lui-même (voir valueRow, mode click).
   `valueRow` n'est fourni qu'en mode "click" (édition d'un token précis sans activer toute la
   ligne en texte libre, cf. ExerciseCard) — pré-rempli avec la valeur actuelle, un tap dedans
   ouvre le clavier pour taper une valeur personnalisée ; sinon un tap direct sur une suggestion
   applique la valeur sans jamais ouvrir le clavier (façon sélecteur multi-valeurs Notion). */
function TokenSuggestionPanel({ suggestions, selectedIdx, onAccept, onCancelBlur, anchorRect, isMobile, valueRow }: {
  suggestions: TokenSuggestion[];
  selectedIdx: number;
  onAccept: (value: string) => void;
  onCancelBlur: () => void;
  anchorRect: DOMRect | null;
  isMobile: boolean;
  valueRow?: { value: string; onChange: (v: string) => void; onClear: () => void; inputRef?: (el: HTMLInputElement | null) => void; onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>; onFocus?: () => void; onBlur?: () => void };
}) {
  const keyboardInset = useKeyboardInset(isMobile);

  const list = suggestions.length > 0 ? (
    <div style={{ padding: "6px 0" }}>
      {valueRow && <div style={{ padding: "6px 14px 2px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b0b4b7" }}>Suggestions</div>}
      {suggestions.map((s, i) => (
        <div key={i} onMouseDown={e => { e.preventDefault(); onCancelBlur(); onAccept(s.value); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: i === selectedIdx ? "#fff5f2" : "#fff" }}>
          <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "#171b1f", minWidth: 0 }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{s.meta}</span>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, flexShrink: 0, ...AC_BADGE_STYLE[s.type] }}>{AC_BADGE_LABEL[s.type]}</span>
        </div>
      ))}
    </div>
  ) : valueRow ? (
    <div style={{ padding: "10px 14px", fontSize: 12, color: "#bbb" }}>Aucune suggestion — tape une valeur.</div>
  ) : null;

  const content = (
    <>
      {valueRow && (
        <div style={{ padding: "10px 14px", borderBottom: (suggestions.length > 0 || valueRow) ? "1px solid #eee" : "none", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f5f5f5", borderRadius: 9, padding: "8px 10px" }}>
            <input
              ref={valueRow.inputRef}
              value={valueRow.value}
              onChange={e => valueRow.onChange(e.target.value)}
              onKeyDown={valueRow.onKeyDown}
              onFocus={valueRow.onFocus}
              onBlur={valueRow.onBlur}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 16, fontFamily: "inherit", color: "#171b1f" }}
            />
            {valueRow.value && (
              <button
                onMouseDown={e => { e.preventDefault(); onCancelBlur(); valueRow.onClear(); }}
                aria-label="Effacer"
                style={{ border: "none", background: "none", cursor: "pointer", color: "#9a9ea1", fontSize: 17, padding: 0, lineHeight: 1, flexShrink: 0 }}
              >×</button>
            )}
          </div>
        </div>
      )}
      <div style={{ overflowY: "auto" }}>{list}</div>
    </>
  );

  if (isMobile) {
    return (
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: keyboardInset, zIndex: 2147483200,
          background: "#fff", borderRadius: "16px 16px 0 0", boxShadow: "0 -10px 32px rgba(0,0,0,.20)",
          maxHeight: "50vh", display: "flex", flexDirection: "column",
          animation: "sheetInUp 0.18s cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#e2e2e2" }} />
        </div>
        {content}
      </div>
    );
  }

  if (!anchorRect) return null;
  const rect = anchorRect;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 800;
  const vpW = typeof window !== "undefined" ? window.innerWidth : 400;
  const panelWidth = Math.max(rect.width, 280);
  const spaceBelow = vpH - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const showBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const left = Math.max(8, Math.min(rect.left, vpW - panelWidth - 8));
  return (
    <div style={{
      position: "fixed", left, width: panelWidth,
      top: showBelow ? rect.bottom + 6 : undefined, bottom: showBelow ? undefined : vpH - rect.top + 6,
      maxHeight: Math.max(160, showBelow ? spaceBelow : spaceAbove),
      background: "#fff", border: "1px solid #e8e8e8", borderRadius: 14, boxShadow: "0 10px 32px rgba(0,0,0,.18)",
      zIndex: 2147483200, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {content}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

interface MenuRow { key: string; label: string; icon: React.ReactNode; danger?: boolean; onSelect: () => void }

function ActionMenu({ rows, onClose, anchorRect }: { rows: MenuRow[]; onClose: () => void; anchorRect: DOMRect }) {
  const vpH = typeof window !== "undefined" ? window.innerHeight : 800;
  const vpW = typeof window !== "undefined" ? window.innerWidth : 400;
  const width = 220;
  const left = Math.min(Math.max(8, anchorRect.right - width), vpW - width - 8);
  const showBelow = vpH - anchorRect.bottom - 8 >= rows.length * 40 + 10;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2147483150 }} />
      <div style={{
        position: "fixed", left, width,
        top: showBelow ? anchorRect.bottom + 4 : undefined,
        bottom: showBelow ? undefined : vpH - anchorRect.top + 4,
        background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, boxShadow: "0 10px 32px rgba(0,0,0,.18)",
        zIndex: 2147483200, overflow: "hidden",
      }}>
        {rows.map(r => (
          <button
            key={r.key}
            onClick={() => { r.onSelect(); onClose(); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              border: "none", background: "#fff", cursor: "pointer", textAlign: "left",
              fontSize: 13, fontWeight: 700, color: r.danger ? "#c81e1e" : "#171b1f",
            }}
          >
            <span style={{ display: "flex", color: r.danger ? "#c81e1e" : "#9a9ea1", flexShrink: 0 }}>{r.icon}</span>
            {r.label}
          </button>
        ))}
      </div>
    </>
  );
}

function TokenInput({ value, onChange, onCommit, onCancel, placeholder, autoFocus, isPanelOwner, requestPanel, releasePanel }: {
  value: string; onChange: (v: string) => void; onCommit: () => void; onCancel?: () => void; placeholder?: string; autoFocus?: boolean;
  /* Même mécanisme de panneau exclusif que ExerciseCard (cf. CardProps) — un seul panneau ouvert
     à la fois, tous exercices confondus (lignes existantes + composeur "+ Ajouter une séance"). */
  isPanelOwner: boolean; requestPanel: () => void; releasePanel: () => void;
}) {
  const { isMd } = useBreakpoint();
  const [ac, setAc] = useState<AcState | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-grow — jamais de scroll interne, la ligne doit toujours se voir en entier comme un vrai
  // champ texte (demande explicite : "je veux tout voir comme un champ texte").
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Un autre token/champ (ailleurs dans la liste) a pris possession du panneau partagé — ferme le
  // nôtre plutôt que de laisser 2 panneaux ouverts en même temps.
  useEffect(() => {
    if (!isPanelOwner && ac) closeAc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOwner]);

  function closeAc() { setAc(null); releasePanel(); }
  function openAc(suggestions: TokenSuggestion[], replaceStart: number | null, replaceEnd: number | null) {
    const el = ref.current;
    if (!el || !suggestions.length) { closeAc(); return; }
    requestPanel();
    setAc({ suggestions, selectedIdx: 0, replaceStart, replaceEnd, rect: el.getBoundingClientRect() });
  }
  function refreshSuggestions(text: string, pos: number) {
    const { currentToken, fullLine } = getCurrentToken(text, pos);
    if (!fullLine.trim()) { closeAc(); return; }
    openAc(generateSuggestions(currentToken, fullLine), null, null);
  }
  function handleChange(text: string) {
    onChange(text);
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? text.length;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshSuggestions(text, pos), 120);
  }
  function resolveClickSuggestions(pos: number) {
    const el = ref.current;
    if (!el) return;
    const text = el.value;
    const clicked = getClickToken(text, pos);
    if (!clicked) {
      const { fullLine } = getCurrentToken(text, pos);
      if (!fullLine.trim()) { closeAc(); return; }
      openAc(generateSuggestions("", fullLine), null, null);
      return;
    }
    const suggestions = generateSuggestionsClickMode(clicked.token, clicked.fullLine);
    if (!suggestions.length) openAc(generateSuggestions(clicked.token, clicked.fullLine), null, null);
    else openAc(suggestions, clicked.tokenStart, clicked.tokenEnd);
  }
  function handleClick() {
    const el = ref.current;
    if (!el) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => resolveClickSuggestions(el.selectionStart ?? 0), 60);
  }
  function acceptSuggestion(valueToInsert: string) {
    const el = ref.current;
    if (!el || !ac) return;
    const text = el.value;
    let tokenStart: number, endPos: number;
    if (ac.replaceStart !== null && ac.replaceEnd !== null) { tokenStart = ac.replaceStart; endPos = ac.replaceEnd; }
    else { const pos = el.selectionStart ?? text.length; tokenStart = getCurrentToken(text, pos).tokenStart; endPos = pos; }
    const trailer = endPos < text.length && text[endPos] === " " ? "" : " ";
    const newText = text.slice(0, tokenStart) + valueToInsert + trailer + text.slice(endPos);
    onChange(newText);
    closeAc();
    const newPos = tokenStart + valueToInsert.length + trailer.length;
    requestAnimationFrame(() => {
      const e = ref.current;
      if (e) { e.focus(); e.setSelectionRange(newPos, newPos); }
      setTimeout(() => refreshSuggestions(newText, newPos), 60);
    });
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (ac) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx + 1) % p.suggestions.length } : p); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx - 1 + p.suggestions.length) % p.suggestions.length } : p); return; }
      if (e.key === "Tab") { const sel = ac.suggestions[ac.selectedIdx]; if (sel) { e.preventDefault(); acceptSuggestion(sel.value); } return; }
      if (e.key === "Escape") { e.preventDefault(); closeAc(); return; }
    }
    // Entrée reste un raccourci explicite pour valider tout de suite (jamais un saut de ligne dans
    // une ligne d'exercice) — mais n'est plus indispensable, voir handleBlur : la sortie du champ
    // enregistre déjà automatiquement.
    if (e.key === "Enter") { e.preventDefault(); closeAc(); onCommit(); }
    if (e.key === "Escape" && onCancel) onCancel();
  }
  function handleBlur() {
    // Enregistrement automatique à la sortie du champ — plus besoin d'Entrée (demande explicite).
    // Délai de 150ms : laisse le temps à un onMouseDown sur une suggestion (qui preventDefault le
    // mousedown, donc ne déclenche jamais ce blur) de s'exécuter avant qu'on ne referme/committe.
    blurTimeout.current = setTimeout(() => { closeAc(); onCommit(); }, 150);
  }

  return (
    <>
      <textarea
        ref={ref} value={value} autoFocus={autoFocus} placeholder={placeholder} rows={1}
        onChange={e => handleChange(e.target.value)} onClick={handleClick} onKeyDown={handleKeyDown} onBlur={handleBlur}
        style={{
          display: "block", width: "100%", fontSize: 16, fontFamily: "inherit", border: "none", outline: "none",
          background: "transparent", color: "#171b1f", padding: 0, margin: 0, resize: "none", overflow: "hidden",
          whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.4,
        }}
      />
      {ac && isPanelOwner && (
        <TokenSuggestionPanel
          suggestions={ac.suggestions} selectedIdx={ac.selectedIdx} onAccept={acceptSuggestion}
          onCancelBlur={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); }}
          anchorRect={ac.rect} isMobile={!isMd}
        />
      )}
    </>
  );
}

/* TOKEN_RE vit désormais dans exerciseAutocomplete.ts (source unique, réutilisée aussi par
   getClickToken côté détection) — voir ce fichier pour le détail des 4 alternatives.

   `onTokenClick` reçoit les bornes exactes du même match TOKEN_RE utilisé pour l'affichage — la
   source de vérité du "qu'est-ce qui est cliqué" est donc unique (plus de recalcul séparé via
   getClickToken pour ce chemin, cf. ExerciseCard). Le token cliqué en cours d'édition (mode click,
   voir ExerciseCard) est mis en évidence différemment (fond plein plutôt que teinté) pour montrer
   clairement quel token le panneau de suggestions est en train de modifier. */
function Tokenized({ text, onTokenClick, activeSpan }: {
  text: string;
  onTokenClick?: (start: number, end: number, rect: DOMRect) => void;
  activeSpan?: { start: number; end: number } | null;
}) {
  const spans: { start: number; end: number; kind: "numeric" | "name" }[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    spans.push({ start: m.index, end: m.index + m[0].length, kind: "numeric" });
  }
  // Le nom de l'exercice est aussi un token cliquable (demande explicite : "les exercices ne sont
  // pas tokénisés") — jamais ajouté s'il chevauche un token numérique déjà trouvé (arrive quand le
  // nom EST une distance/durée, ex. "400m" reconnu à la fois comme nom et comme volume — un seul
  // span suffit dans ce cas, inutile de le dupliquer). Plusieurs spans "name" possibles quand la
  // ligne combine plusieurs exercices avec "+" (ex. "Power clean + Split jerk") — chacun devient
  // sa propre pastille cliquable, le "+" restant du texte simple entre les deux.
  const nameSpans = findNameSpans(text);
  nameSpans.forEach(nameSpan => {
    if (!spans.some(s => nameSpan.start < s.end && nameSpan.end > s.start)) {
      spans.push({ ...nameSpan, kind: "name" });
    }
  });
  spans.sort((a, b) => a.start - b.start);

  const parts: { text: string; isToken: boolean; start: number; end: number; kind?: "numeric" | "name" }[] = [];
  let lastIndex = 0;
  spans.forEach(s => {
    if (s.start > lastIndex) parts.push({ text: text.slice(lastIndex, s.start), isToken: false, start: lastIndex, end: s.start });
    parts.push({ text: text.slice(s.start, s.end), isToken: true, start: s.start, end: s.end, kind: s.kind });
    lastIndex = s.end;
  });
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), isToken: false, start: lastIndex, end: text.length });

  return (
    <>
      {parts.map((part, i) => {
        if (!part.isToken) return part.text;
        const isActive = !!activeSpan && activeSpan.start === part.start && activeSpan.end === part.end;
        const isName = part.kind === "name";
        const baseBg = isName ? "#EBF5FB" : "rgba(212,64,0,.1)";
        const baseColor = isName ? "#2980B9" : "#d44000";
        return (
          <span
            key={i}
            onClick={onTokenClick ? e => { e.stopPropagation(); onTokenClick(part.start, part.end, e.currentTarget.getBoundingClientRect()); } : undefined}
            style={{
              background: isActive ? baseColor : baseBg, color: isActive ? "#fff" : baseColor,
              fontWeight: 800, borderRadius: 6, padding: "1px 6px", marginLeft: i === 0 ? 0 : 4, fontSize: 13.5,
              cursor: onTokenClick ? "pointer" : undefined,
            }}
          >
            {part.text}
          </span>
        );
      })}
    </>
  );
}

function VideoIcon() {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M22 8.5 16 12l6 3.5v-7z" /></svg>;
}
function PhotoIcon() {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>;
}
function CommentIcon() {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H4l1.6-3.8a8.4 8.4 0 1 1 15.4-4.6z" /></svg>;
}
function GripIcon() {
  return (
    <svg width={11} height={16} viewBox="0 0 11 16" fill="currentColor">
      <circle cx="2.5" cy="2.5" r="1.4" /><circle cx="8.5" cy="2.5" r="1.4" />
      <circle cx="2.5" cy="8" r="1.4" /><circle cx="8.5" cy="8" r="1.4" />
      <circle cx="2.5" cy="13.5" r="1.4" /><circle cx="8.5" cy="13.5" r="1.4" />
    </svg>
  );
}

function isVideoFileUrl(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url);
}
function youTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
function loomEmbed(url: string): string | null {
  const m = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
  return m ? `https://www.loom.com/embed/${m[1]}` : null;
}
function vimeoEmbed(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

/* Aperçu réel du média, pas juste un lien — "photo" est toujours affiché comme une image (déclaré
   comme telle par le champ où l'URL a été collée, extension ou non) ; "video" tente un embed
   YouTube/Loom/Vimeo, sinon une balise <video> directe (upload, lien de fichier direct). */
function MediaPreview({ url, kind }: { url: string; kind: "video" | "photo" }) {
  if (kind === "photo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, display: "block" }} />;
  }
  if (isVideoFileUrl(url)) {
    return <video src={url} controls style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", background: "#000" }} />;
  }
  const embed = youTubeEmbed(url) || loomEmbed(url) || vimeoEmbed(url);
  if (embed) {
    return (
      <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: 8, overflow: "hidden", background: "#000" }}>
        <iframe
          src={embed} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>
    );
  }
  // Lien vidéo non reconnu (CDN direct sans extension, etc.) — on tente quand même <video>.
  return <video src={url} controls style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", background: "#000" }} />;
}

function AttachField({ label, icon, url, kind, onSet, onClear }: {
  label: string; icon: React.ReactNode; url?: string; kind: "video" | "photo"; onSet: (url: string) => void; onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (url && !editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MediaPreview url={url} kind={kind} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setDraft(url); setEditing(true); }} style={{ fontSize: 11, fontWeight: 700, color: "#62686e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remplacer</button>
          <button onClick={onClear} style={{ fontSize: 11, fontWeight: 700, color: "#c81e1e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Retirer</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={{ color: "#9a9ea1", flexShrink: 0, display: "flex", alignItems: "center" }}>{icon}</span>
      <input
        value={draft} onChange={e => setDraft(e.target.value)}
        placeholder={label}
        style={{ flex: 1, fontSize: 16, padding: "6px 9px", borderRadius: 8, border: "1px solid rgba(0,0,0,.1)", outline: "none" }}
        onKeyDown={e => { if (e.key === "Enter" && draft.trim()) { onSet(draft.trim()); setDraft(""); setEditing(false); } }}
      />
      <button
        onClick={() => { if (draft.trim()) { onSet(draft.trim()); setDraft(""); setEditing(false); } }}
        style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#d44000", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}
      >
        OK
      </button>
    </div>
  );
}

interface Line { id: string; text: string }

function emptyAttachments(): ExerciseAttachments {
  return { comments: [] };
}

interface CardProps {
  line: Line;
  editing: boolean;
  onStartEdit: () => void;
  onCommitEdit: (text: string) => void;
  onDeleteEmpty: () => void;
  onDelete: () => void;
  attachments: ExerciseAttachments;
  authorRole: "coach" | "athlete";
  authorName: string;
  onUpdateAttachments: (next: ExerciseAttachments) => void;
  /* Un seul panneau de suggestions ouvert à la fois, tous exercices confondus (cf. ExerciseBlockEditor,
     `openPanelId` partagé) — sans ça, cliquer un token pendant qu'un autre panneau est déjà ouvert les
     empilait tous les deux au lieu de fermer le premier. */
  isPanelOwner: boolean;
  requestPanel: () => void;
  releasePanel: () => void;
}

function ExerciseCard({ line, editing, onStartEdit, onCommitEdit, onDeleteEmpty, onDelete, attachments, authorRole, authorName, onUpdateAttachments, isPanelOwner, requestPanel, releasePanel }: CardProps) {
  const { isMd } = useBreakpoint();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: line.id });
  const [open, setOpen] = useState<"media" | "comments" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [draftText, setDraftText] = useState(line.text);
  /* Édition d'un seul token sans jamais activer toute la ligne en texte libre ("sans que le champ
     soit actif, juste updater les tokens avec les suggestions") — bornes figées au moment du clic
     (snapshot), la valeur courante est retapée à chaque frappe dans le champ du panneau et
     réappliquée immédiatement dans line.text (auto-save, jamais besoin d'un "OK"/Entrée séparé). */
  const [clickTok, setClickTok] = useState<{ start: number; end: number; snapshot: string; value: string; rect: DOMRect } | null>(null);
  const [clickAc, setClickAc] = useState<{ suggestions: TokenSuggestion[]; selectedIdx: number } | null>(null);
  const clickValueRef = useRef<HTMLInputElement | null>(null);
  const clickBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentKind, setCommentKind] = useState<"text" | "video">("text");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasMedia = !!(attachments.videoUrl || attachments.photoUrl);
  const hasComments = attachments.comments.length > 0;
  const commentCount = attachments.comments.length;
  const exerciseName = resolveExerciseName(line.text);

  /* Toute mutation (média ou commentaire) est horodatée + attribuée — pilote le point de
     notification dans les vues de lecture (UnseenDot.tsx). */
  function stampedUpdate(next: ExerciseAttachments) {
    onUpdateAttachments({ ...next, updatedAt: new Date().toISOString(), updatedBy: authorRole });
  }

  /* Réutilisation automatique par nom d'exercice — sans confirmation, c'est le but de la
     bibliothèque : le même token "nom" (ex. "Back squat") retrouve directement sa vidéo. */
  useEffect(() => {
    if (attachments.videoUrl || !exerciseName) return;
    let cancelled = false;
    lookupLibraryVideo(exerciseName).then(url => {
      if (!cancelled && url) stampedUpdate({ ...attachments, videoUrl: url });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName]);

  function resetComposer() {
    setCommentDraft(""); setCommentKind("text"); setEditingCommentId(null);
  }

  function sendComment() {
    if (!commentDraft.trim()) return;
    if (editingCommentId) {
      stampedUpdate({
        ...attachments,
        comments: attachments.comments.map(c => c.id === editingCommentId
          ? { ...c, kind: commentKind, text: commentKind === "text" ? commentDraft.trim() : undefined, url: commentKind === "video" ? commentDraft.trim() : undefined }
          : c),
      });
    } else {
      const comment: ExerciseComment = {
        id: crypto.randomUUID(), author: authorRole, authorName, kind: commentKind,
        ...(commentKind === "text" ? { text: commentDraft.trim() } : { url: commentDraft.trim() }),
        createdAt: new Date().toISOString(),
      };
      stampedUpdate({ ...attachments, comments: [...attachments.comments, comment] });
    }
    resetComposer();
  }

  function deleteComment(id: string) {
    stampedUpdate({ ...attachments, comments: attachments.comments.filter(c => c.id !== id) });
    if (editingCommentId === id) resetComposer();
  }

  function startEditComment(c: ExerciseComment) {
    setEditingCommentId(c.id);
    setCommentKind(c.kind);
    setCommentDraft(c.kind === "text" ? (c.text ?? "") : (c.url ?? ""));
  }

  useEffect(() => () => {
    if (clickBlurTimeout.current) clearTimeout(clickBlurTimeout.current);
    if (clickDebounceRef.current) clearTimeout(clickDebounceRef.current);
  }, []);

  // Focus immédiat du champ valeur sur desktop uniquement (pas de coût clavier virtuel à éviter) —
  // sur mobile, le panneau s'ouvre sans jamais donner le focus, exactement la demande initiale
  // ("n'ouvre pas le clavier sur mobile"). Ne se redéclenche que sur un nouveau token (start/end),
  // jamais à chaque frappe dans le champ lui-même.
  useEffect(() => {
    if (clickTok && isMd) requestAnimationFrame(() => clickValueRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickTok?.start, clickTok?.end, isMd]);

  // Un autre token (sur cette carte ou une autre) a pris possession du panneau partagé — ferme le
  // nôtre silencieusement (même chemin que la fermeture normale) plutôt que de laisser 2 panneaux
  // ouverts en même temps (cascade).
  useEffect(() => {
    if (!isPanelOwner && clickTok) closeClickTok();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOwner]);

  /* Clic sur un token en lecture — ouvre le panneau directement sur ce token, sans jamais passer
     par onStartEdit (qui activerait toute la ligne en texte libre). `start`/`end` viennent
     directement de Tokenized (même regex que l'affichage), jamais recalculés autrement.
     requestPanel() prend possession du panneau partagé — ferme automatiquement tout autre panneau
     déjà ouvert (cf. l'effet ci-dessus, côté de la carte qui le perd). */
  function openTokenClick(start: number, end: number, rect: DOMRect) {
    requestPanel();
    const snapshot = line.text;
    const value = snapshot.slice(start, end);
    setClickTok({ start, end, snapshot, value, rect });
    const clickSugg = generateSuggestionsClickMode(value, snapshot.trim());
    setClickAc({ suggestions: clickSugg.length ? clickSugg : generateSuggestions(value, snapshot.trim()), selectedIdx: 0 });
  }
  function updateClickValue(newValue: string) {
    if (!clickTok) return;
    const newLineText = clickTok.snapshot.slice(0, clickTok.start) + newValue + clickTok.snapshot.slice(clickTok.end);
    setClickTok({ ...clickTok, value: newValue });
    // Vider le token jusqu'à vider la ligne entière est rare (une ligne réduite à un seul token) —
    // dans ce cas on committe quand même le texte tel quel (jamais onDeleteEmpty pendant la frappe,
    // seulement à la fermeture définitive du panneau, cf. closeClickTok) pour ne pas supprimer la
    // ligne sous les yeux de l'utilisateur alors que le panneau est encore ouvert.
    onCommitEdit(newLineText);
    if (clickDebounceRef.current) clearTimeout(clickDebounceRef.current);
    clickDebounceRef.current = setTimeout(() => {
      setClickAc({ suggestions: generateSuggestions(newValue, newLineText.trim()), selectedIdx: 0 });
    }, 120);
  }
  function acceptClickSuggestion(newValue: string) {
    if (!clickTok) return;
    const newLineText = clickTok.snapshot.slice(0, clickTok.start) + newValue + clickTok.snapshot.slice(clickTok.end);
    onCommitEdit(newLineText);
    setClickTok(null);
    setClickAc(null);
    releasePanel();
  }
  function closeClickTok() {
    if (clickTok && !line.text.trim()) onDeleteEmpty();
    setClickTok(null);
    setClickAc(null);
    releasePanel();
  }
  function cancelClickTok() {
    if (clickTok) onCommitEdit(clickTok.snapshot);
    closeClickTok();
  }
  function handleClickValueBlur() {
    clickBlurTimeout.current = setTimeout(closeClickTok, 150);
  }

  async function handleFileSelected(file: File) {
    setUploading(true);
    try {
      const url = await uploadExerciseVideo(file);
      if (editingCommentId) {
        stampedUpdate({
          ...attachments,
          comments: attachments.comments.map(c => c.id === editingCommentId ? { ...c, kind: "video", url, text: undefined } : c),
        });
      } else {
        const comment: ExerciseComment = { id: crypto.randomUUID(), author: authorRole, authorName, kind: "video", url, createdAt: new Date().toISOString() };
        stampedUpdate({ ...attachments, comments: [...attachments.comments, comment] });
      }
      resetComposer();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de l'envoi de la vidéo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 12,
        padding: "9px 10px", marginBottom: 6,
        transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span {...attributes} {...listeners} style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", flexShrink: 0, display: "flex" }}>
          <GripIcon />
        </span>

        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <TokenInput
              value={draftText} onChange={setDraftText} autoFocus
              isPanelOwner={isPanelOwner} requestPanel={requestPanel} releasePanel={releasePanel}
              onCommit={() => {
                const trimmed = draftText.trim();
                if (!trimmed) { onDeleteEmpty(); return; }
                onCommitEdit(trimmed);
              }}
              onCancel={() => onCommitEdit(line.text)}
            />
          </div>
        ) : (
          <div
            onClick={() => { setDraftText(line.text); closeClickTok(); onStartEdit(); }}
            style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: "#2c3236", cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            <Tokenized
              text={line.text}
              onTokenClick={(start, end, rect) => openTokenClick(start, end, rect)}
              activeSpan={clickTok ? { start: clickTok.start, end: clickTok.start + clickTok.value.length } : null}
            />
          </div>
        )}
        {clickTok && clickAc && isPanelOwner && (
          <TokenSuggestionPanel
            suggestions={clickAc.suggestions} selectedIdx={clickAc.selectedIdx} onAccept={acceptClickSuggestion}
            onCancelBlur={() => { if (clickBlurTimeout.current) clearTimeout(clickBlurTimeout.current); }}
            anchorRect={clickTok.rect} isMobile={!isMd}
            valueRow={{
              value: clickTok.value,
              onChange: updateClickValue,
              onClear: () => updateClickValue(""),
              inputRef: el => { clickValueRef.current = el; },
              onBlur: handleClickValueBlur,
              onKeyDown: e => {
                if (e.key === "Enter") { e.preventDefault(); closeClickTok(); }
                if (e.key === "Escape") { e.preventDefault(); cancelClickTok(); }
              },
            }}
          />
        )}

        <button
          ref={moreRef}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Actions"
          style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: "none", cursor: "pointer",
            background: (hasMedia || hasComments) ? "rgba(212,64,0,.1)" : "#f1f1f1",
            color: (hasMedia || hasComments) ? "#d44000" : "#9a9ea1",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <MoreIcon />
        </button>
        {menuOpen && moreRef.current && (
          <ActionMenu
            anchorRect={moreRef.current.getBoundingClientRect()}
            onClose={() => setMenuOpen(false)}
            rows={[
              { key: "media", label: hasMedia ? "Vidéo démo · ajoutée" : "Ajouter une vidéo démo", icon: <VideoIcon />, onSelect: () => setOpen("media") },
              { key: "comments", label: commentCount > 0 ? `Commentaires · ${commentCount}` : "Laisser un commentaire", icon: <CommentIcon />, onSelect: () => setOpen("comments") },
              { key: "delete", label: "Supprimer l'exercice", icon: (
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              ), danger: true, onSelect: onDelete },
            ]}
          />
        )}
      </div>

      {(hasMedia || open === "media") && (
        <div style={{ marginTop: 8, marginLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {(attachments.videoUrl || open === "media") && (
            <AttachField
              label="Lien vidéo (Loom, YouTube…)" icon={<VideoIcon />} url={attachments.videoUrl} kind="video"
              onSet={url => {
                stampedUpdate({ ...attachments, videoUrl: url });
                if (exerciseName) saveLibraryVideo(exerciseName, url);
              }}
              onClear={() => {
                stampedUpdate({ ...attachments, videoUrl: undefined });
                if (exerciseName) deleteLibraryVideo(exerciseName);
              }}
            />
          )}
          {(attachments.photoUrl || open === "media") && (
            <AttachField
              label="Lien photo" icon={<PhotoIcon />} url={attachments.photoUrl} kind="photo"
              onSet={url => stampedUpdate({ ...attachments, photoUrl: url })}
              onClear={() => stampedUpdate({ ...attachments, photoUrl: undefined })}
            />
          )}
        </div>
      )}

      {(hasComments || open === "comments") && (
        <div style={{
          marginTop: 8, marginLeft: 18, display: "flex", flexDirection: "column", gap: 6,
          border: "1px solid rgba(0,0,0,.08)", borderRadius: 10, background: "#fafafa", padding: "8px 9px",
        }}>
          {attachments.comments.map(c => {
            const mine = c.author === authorRole;
            return (
              <div key={c.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%",
                  background: editingCommentId === c.id ? "#ffe8dc" : mine ? "rgba(212,64,0,.1)" : "#f7f8f9",
                  borderRadius: 10,
                  borderBottomRightRadius: mine ? 2 : 10,
                  borderBottomLeftRadius: mine ? 10 : 2,
                  padding: "6px 9px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", color: mine ? "#d44000" : "#9a9ea1" }}>
                      {c.authorName}
                    </span>
                    {mine && (
                      <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button onClick={() => { startEditComment(c); setOpen("comments"); }} style={{ fontSize: 10, fontWeight: 700, color: "#62686e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Modifier</button>
                        <button onClick={() => deleteComment(c.id)} style={{ fontSize: 10, fontWeight: 700, color: "#c81e1e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Supprimer</button>
                      </span>
                    )}
                  </div>
                  {c.kind === "text" ? (
                    <div style={{ fontSize: 12, color: "#171b1f", marginTop: 2 }}>{c.text}</div>
                  ) : (
                    <div style={{ marginTop: 4 }}><MediaPreview url={c.url ?? ""} kind="video" /></div>
                  )}
                </div>
              </div>
            );
          })}

          {open === "comments" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {editingCommentId && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#8a8f94" }}>
                  Modification en cours
                  <button onClick={resetComposer} style={{ fontSize: 10, fontWeight: 700, color: "#62686e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Annuler</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ display: "flex", borderRadius: 8, border: "1px solid rgba(0,0,0,.1)", overflow: "hidden", flexShrink: 0 }}>
                  {(["text", "video"] as const).map(k => (
                    <button
                      key={k} onClick={() => setCommentKind(k)}
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: "6px 8px", border: "none", cursor: "pointer",
                        background: commentKind === k ? "#d44000" : "#fff", color: commentKind === k ? "#fff" : "#7b7f82",
                      }}
                    >
                      {k === "text" ? "Texte" : "Vidéo"}
                    </button>
                  ))}
                </div>
                <input
                  value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                  placeholder={commentKind === "text" ? "Écris un commentaire…" : "Lien vidéo (Loom, YouTube…)"}
                  onKeyDown={e => { if (e.key === "Enter") sendComment(); }}
                  style={{ flex: 1, minWidth: 0, fontSize: 16, padding: "6px 9px", borderRadius: 8, border: "1px solid rgba(0,0,0,.1)", outline: "none" }}
                />
                {commentKind === "video" && (
                  <>
                    <input
                      ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      title="Envoyer une vidéo depuis l'appareil"
                      style={{ fontSize: 11, fontWeight: 700, color: "#62686e", background: "#f1f1f1", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer", flexShrink: 0 }}
                    >
                      {uploading ? "…" : "📤"}
                    </button>
                  </>
                )}
                <button onClick={sendComment} disabled={uploading} style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#d44000", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer", flexShrink: 0 }}>
                  OK
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setOpen("comments")}
              style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: "#d44000", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              + Ajouter un commentaire
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  authorRole: "coach" | "athlete";
  authorName: string;
  initialMedia?: Record<string, ExerciseAttachments> | null;
  onMediaChange?: (media: Record<string, ExerciseAttachments>) => void;
}

export default function ExerciseBlockEditor({ value, onChange, authorRole, authorName, initialMedia, onMediaChange }: Props) {
  const [lines, setLines] = useState<Line[]>(() =>
    value.split("\n").filter(l => l.trim()).map(text => ({ id: crypto.randomUUID(), text }))
  );
  const [mediaById, setMediaById] = useState<Record<string, ExerciseAttachments>>(() => {
    const initLines = value.split("\n").filter(l => l.trim());
    const out: Record<string, ExerciseAttachments> = {};
    initLines.forEach((_, i) => {
      const m = initialMedia?.[String(i)];
      if (m) out[lines[i]?.id ?? ""] = m;
    });
    return out;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* Panneau de suggestions exclusif : un seul ouvert à la fois, tous exercices confondus (lignes +
     composeur "+ Ajouter une séance") — remplace l'état local par carte qui laissait plusieurs
     panneaux s'empiler quand on cliquait un token pendant qu'un autre était déjà ouvert. `null` =
     rien d'ouvert ; sinon l'id du "propriétaire" courant (line.id, ou "composer"). Le releasePanel
     passé à chaque enfant est pré-lié à son propre id (via releasePanelFor), donc toujours sûr à
     appeler même si cet enfant n'est plus le propriétaire courant (no-op dans ce cas). */
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  function releasePanelFor(id: string) {
    setOpenPanelId(prev => (prev === id ? null : prev));
  }

  function commitLines(next: Line[]) {
    setLines(next);
    onChange(next.map(l => l.text).join("\n"));
  }

  function persistMedia(byId: Record<string, ExerciseAttachments>, order: Line[]) {
    if (!onMediaChange) return;
    const byIndex: Record<string, ExerciseAttachments> = {};
    order.forEach((l, i) => { if (byId[l.id]) byIndex[String(i)] = byId[l.id]; });
    onMediaChange(byIndex);
  }

  function updateAttachments(lineId: string, next: ExerciseAttachments) {
    const nextById = { ...mediaById, [lineId]: next };
    setMediaById(nextById);
    persistMedia(nextById, lines);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = lines.findIndex(l => l.id === active.id);
    const newIndex = lines.findIndex(l => l.id === over.id);
    const next = arrayMove(lines, oldIndex, newIndex);
    commitLines(next);
    persistMedia(mediaById, next);
  }

  function addLine() {
    const text = draft.trim();
    if (!text) return;
    const next = [...lines, { id: crypto.randomUUID(), text }];
    commitLines(next);
    setDraft("");
  }

  function deleteLine(id: string) {
    const next = lines.filter(l => l.id !== id);
    commitLines(next);
    if (mediaById[id]) {
      const nextById = { ...mediaById };
      delete nextById[id];
      setMediaById(nextById);
      persistMedia(nextById, next);
    }
  }

  return (
    <div style={{ border: "1.5px solid rgba(0,0,0,.08)", borderRadius: 16, background: "#fff", overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fafafa", borderBottom: "1px solid rgba(0,0,0,.06)", borderRadius: "16px 16px 0 0" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#202428" }}>Exercices de la séance</span>
        <span style={{ fontSize: 11, color: "#8a8f94" }}>{lines.length} exercice{lines.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ padding: 11 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lines.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {lines.map(l => (
              <ExerciseCard
                key={l.id}
                line={l}
                editing={editingId === l.id}
                onStartEdit={() => setEditingId(l.id)}
                onCommitEdit={text => {
                  commitLines(lines.map(x => (x.id === l.id ? { ...x, text } : x)));
                  setEditingId(null);
                }}
                onDeleteEmpty={() => {
                  deleteLine(l.id);
                  setEditingId(null);
                }}
                onDelete={() => deleteLine(l.id)}
                attachments={mediaById[l.id] ?? emptyAttachments()}
                authorRole={authorRole}
                authorName={authorName}
                onUpdateAttachments={next => updateAttachments(l.id, next)}
                isPanelOwner={openPanelId === l.id}
                requestPanel={() => setOpenPanelId(l.id)}
                releasePanel={() => releasePanelFor(l.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 8px" }}>
          <span style={{ color: "#d7d7d7", flexShrink: 0 }}><GripIcon /></span>
          <div style={{ flex: 1 }}>
            <TokenInput
              value={draft} onChange={setDraft} onCommit={addLine}
              placeholder="Écris un exercice, Entrée pour l'ajouter…"
              isPanelOwner={openPanelId === "composer"}
              requestPanel={() => setOpenPanelId("composer")}
              releasePanel={() => releasePanelFor("composer")}
            />
          </div>
        </div>
      </div>

      {/* Backdrop invisible, même mécanisme que celui d'ActionMenu (clic hors du panneau = ferme).
          z-index juste sous celui de TokenSuggestionPanel (2147483200) — le panneau reste toujours
          visuellement au-dessus, donc un clic dedans ne peut jamais atteindre ce backdrop. */}
      {openPanelId !== null && (
        <div onClick={() => setOpenPanelId(null)} style={{ position: "fixed", inset: 0, zIndex: 2147483150 }} />
      )}
    </div>
  );
}
