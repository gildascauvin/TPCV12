"use client";

import { useEffect, useRef, useState } from "react";
import {
  type TokenSuggestion, type TokenType,
  generateSuggestions, generateSuggestionsClickMode, getCurrentToken, getClickToken, resolveExerciseName,
} from "@/lib/exerciseAutocomplete";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExerciseAttachments, ExerciseComment } from "@/types";
import { createClient } from "@/lib/supabase/client";

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

function AcDropdown({ ac, onAccept, onCancelBlur }: { ac: AcState; onAccept: (value: string) => void; onCancelBlur: () => void }) {
  const rect = ac.rect;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 800;
  const vpW = typeof window !== "undefined" ? window.innerWidth : 400;
  const spaceBelow = vpH - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const showBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
  const left = Math.max(8, rect.left);
  return (
    <div style={{
      position: "fixed", left, width: Math.min(rect.width, vpW - left - 8),
      top: showBelow ? rect.bottom + 4 : undefined, bottom: showBelow ? undefined : vpH - rect.top + 4,
      maxHeight: Math.max(120, showBelow ? spaceBelow : spaceAbove), overflowY: "auto",
      background: "#fff", border: "1px solid #e8e8e8", borderRadius: 14, boxShadow: "0 10px 32px rgba(0,0,0,.18)", zIndex: 2147483200,
    }}>
      {ac.suggestions.map((s, i) => (
        <div key={i} onMouseDown={e => { e.preventDefault(); onCancelBlur(); onAccept(s.value); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: i === ac.selectedIdx ? "#fff5f2" : "#fff" }}>
          <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "#171b1f", minWidth: 0 }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{s.meta}</span>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, flexShrink: 0, ...AC_BADGE_STYLE[s.type] }}>{AC_BADGE_LABEL[s.type]}</span>
        </div>
      ))}
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

function TokenInput({ value, onChange, onCommit, onCancel, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; onCommit: () => void; onCancel?: () => void; placeholder?: string; autoFocus?: boolean;
}) {
  const [ac, setAc] = useState<AcState | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function closeAc() { setAc(null); }
  function openAc(suggestions: TokenSuggestion[], replaceStart: number | null, replaceEnd: number | null) {
    const el = ref.current;
    if (!el || !suggestions.length) { closeAc(); return; }
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
  function handleClick() {
    const el = ref.current;
    if (!el) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const pos = el.selectionStart ?? 0;
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
    }, 60);
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
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (ac) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx + 1) % p.suggestions.length } : p); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx - 1 + p.suggestions.length) % p.suggestions.length } : p); return; }
      if (e.key === "Tab") { const sel = ac.suggestions[ac.selectedIdx]; if (sel) { e.preventDefault(); acceptSuggestion(sel.value); } return; }
      if (e.key === "Escape") { e.preventDefault(); closeAc(); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); closeAc(); onCommit(); }
    if (e.key === "Escape" && onCancel) onCancel();
  }
  function handleBlur() {
    blurTimeout.current = setTimeout(() => closeAc(), 150);
  }

  return (
    <>
      <input
        ref={ref} value={value} autoFocus={autoFocus} placeholder={placeholder}
        onChange={e => handleChange(e.target.value)} onClick={handleClick} onKeyDown={handleKeyDown} onBlur={handleBlur}
        style={{ width: "100%", fontSize: 16, fontFamily: "inherit", border: "none", outline: "none", background: "transparent", color: "#171b1f", padding: 0 }}
      />
      {ac && <AcDropdown ac={ac} onAccept={acceptSuggestion} onCancelBlur={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); }} />}
    </>
  );
}

/* Rampes de charge ("@ 80, 85, 87,5 90 / 85 90 92,5 97,5") fusionnées en un seul pastille plutôt
   que la seule première valeur — heuristique d'affichage, indépendante de la grammaire de
   l'autocomplete (exerciseAutocomplete.ts) qui reste inchangée. */
const TOKEN_RE = /(\d+\s?[x×X]\s?\d+(?:\/\S+)?|@\s*\d+(?:[.,]\d+)?(?:[\s,/]+\d+(?:[.,]\d+)?)*\s*%?\s*(?:kg)?\b|\d+\s?(?:kg|s|min|m)\b)/g;

function Tokenized({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <>
      {parts.map((part, i) =>
        TOKEN_RE.test(part) ? (
          <span key={i} style={{ background: "rgba(212,64,0,.1)", color: "#d44000", fontWeight: 800, borderRadius: 6, padding: "1px 6px", marginLeft: i === 0 ? 0 : 4, fontSize: 13.5 }}>
            {part}
          </span>
        ) : part
      )}
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
  onDelete: () => void;
  attachments: ExerciseAttachments;
  authorRole: "coach" | "athlete";
  authorName: string;
  onUpdateAttachments: (next: ExerciseAttachments) => void;
}

function ExerciseCard({ line, editing, onStartEdit, onCommitEdit, onDelete, attachments, authorRole, authorName, onUpdateAttachments }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: line.id });
  const [open, setOpen] = useState<"media" | "comments" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [draftText, setDraftText] = useState(line.text);
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
              onCommit={() => onCommitEdit(draftText.trim() || line.text)}
              onCancel={() => onCommitEdit(line.text)}
            />
          </div>
        ) : (
          <div
            onClick={onStartEdit}
            style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: "#2c3236", cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            <Tokenized text={line.text} />
          </div>
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
        <div style={{ marginTop: 8, marginLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
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
                onDelete={() => deleteLine(l.id)}
                attachments={mediaById[l.id] ?? emptyAttachments()}
                authorRole={authorRole}
                authorName={authorName}
                onUpdateAttachments={next => updateAttachments(l.id, next)}
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
