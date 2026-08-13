"use client";

import { useRef, useState } from "react";
import {
  type TokenSuggestion, type TokenType,
  generateSuggestions, generateSuggestionsClickMode, getCurrentToken, getClickToken,
} from "@/lib/exerciseAutocomplete";

/* Champ exercices partagé (AddSessionModal + CoachSessionModal) — une ligne = un exercice, dans
   une textarea unique, avec autocomplete token-aware (ghost completion). Reprend exactement le
   comportement du POC tpc_editor_v2 : `value`/`onChange` restent du texte simple `\n`-séparé, le
   même format que `sessions.notes`/`programs.template[].notes` partout ailleurs dans l'app. */

interface Props {
  value: string;
  onChange: (value: string) => void;
}

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

export default function ExerciseGhostEditor({ value, onChange }: Props) {
  const [ac, setAc] = useState<AcState | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = value.split("\n").filter(l => l.trim()).length;

  function closeAc() { setAc(null); }

  function openAc(suggestions: TokenSuggestion[], replaceStart: number | null, replaceEnd: number | null) {
    const ta = taRef.current;
    if (!ta || !suggestions.length) { closeAc(); return; }
    setAc({ suggestions, selectedIdx: 0, replaceStart, replaceEnd, rect: ta.getBoundingClientRect() });
  }

  function refreshSuggestions(text: string, pos: number) {
    const { currentToken, fullLine } = getCurrentToken(text, pos);
    if (!fullLine.trim()) { closeAc(); return; }
    openAc(generateSuggestions(currentToken, fullLine), null, null);
  }

  function handleChange(text: string) {
    onChange(text);
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshSuggestions(text, pos), 120);
  }

  function handleClick() {
    const ta = taRef.current;
    if (!ta) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const pos = ta.selectionStart;
      const text = ta.value;
      const clicked = getClickToken(text, pos);
      if (!clicked) {
        const { fullLine } = getCurrentToken(text, pos);
        if (!fullLine.trim()) { closeAc(); return; }
        openAc(generateSuggestions("", fullLine), null, null);
        return;
      }
      const suggestions = generateSuggestionsClickMode(clicked.token, clicked.fullLine);
      if (!suggestions.length) {
        openAc(generateSuggestions(clicked.token, clicked.fullLine), null, null);
      } else {
        openAc(suggestions, clicked.tokenStart, clicked.tokenEnd);
      }
    }, 60);
  }

  function acceptSuggestion(valueToInsert: string) {
    const ta = taRef.current;
    if (!ta || !ac) return;
    const text = ta.value;
    let tokenStart: number, endPos: number;
    if (ac.replaceStart !== null && ac.replaceEnd !== null) {
      tokenStart = ac.replaceStart;
      endPos = ac.replaceEnd;
    } else {
      const pos = ta.selectionStart;
      tokenStart = getCurrentToken(text, pos).tokenStart;
      endPos = pos;
    }
    const trailer = endPos < text.length && text[endPos] === " " ? "" : " ";
    const newText = text.slice(0, tokenStart) + valueToInsert + trailer + text.slice(endPos);
    onChange(newText);
    closeAc();
    const newPos = tokenStart + valueToInsert.length + trailer.length;
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
      // Token suivant suggéré automatiquement (Mode B) — sans avoir à re-cliquer dans le champ,
      // même comportement que le POC (acceptAcSuggestion → setTimeout(onExerciseInput, 60)).
      setTimeout(() => refreshSuggestions(newText, newPos), 60);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!ac) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx + 1) % p.suggestions.length } : p); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAc(p => p ? { ...p, selectedIdx: (p.selectedIdx - 1 + p.suggestions.length) % p.suggestions.length } : p); return; }
    if (e.key === "Tab") {
      const sel = ac.suggestions[ac.selectedIdx];
      if (sel) { e.preventDefault(); acceptSuggestion(sel.value); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); closeAc(); }
  }

  function handleBlur() {
    blurTimeout.current = setTimeout(() => closeAc(), 150);
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>
        Exercices de la séance
      </div>
      <div style={{ border: "1.5px solid rgba(0,0,0,.08)", borderRadius: 16, overflow: "visible", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fafafa", borderBottom: "1px solid rgba(0,0,0,.06)", borderRadius: "16px 16px 0 0" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#202428" }}>Une ligne = un exercice</span>
          <span style={{ fontSize: 11, color: "#8a8f94" }}>{count} exercice{count !== 1 ? "s" : ""}</span>
        </div>
        <textarea
          ref={taRef}
          value={value}
          rows={7}
          onChange={e => handleChange(e.target.value)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={"Commencez à taper un exercice…\nex: Back squat, Snatch, Clean…"}
          style={{
            // fontSize >= 16px : en dessous, iOS Safari zoome automatiquement la page au focus.
            width: "100%", padding: "12px 14px", fontSize: 16, fontFamily: "inherit", lineHeight: 1.6,
            border: "none", outline: "none", resize: "none", minHeight: 160,
            background: "#fff", color: "#171b1f", boxSizing: "border-box" as const,
          }}
        />
        <div style={{ padding: "8px 14px", background: "#fafafa", borderTop: "1px solid rgba(0,0,0,.06)", borderRadius: "0 0 16px 16px" }}>
          <span style={{ fontSize: 11, color: "#ccc" }}>Entrée = nouvel exercice · Tab = accepter suggestion</span>
        </div>
      </div>

      {ac && (
        <AcDropdown
          ac={ac}
          onAccept={acceptSuggestion}
          onCancelBlur={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); }}
        />
      )}
    </div>
  );
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
    <div
      style={{
        position: "fixed",
        left,
        width: Math.min(rect.width, vpW - left - 8),
        top: showBelow ? rect.bottom + 4 : undefined,
        bottom: showBelow ? undefined : vpH - rect.top + 4,
        maxHeight: Math.max(120, showBelow ? spaceBelow : spaceAbove),
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #e8e8e8",
        borderRadius: 14,
        boxShadow: "0 10px 32px rgba(0,0,0,.18)",
        zIndex: 2147483200,
      }}
    >
      {ac.suggestions.map((s, i) => (
        <div
          key={i}
          onMouseDown={e => { e.preventDefault(); onCancelBlur(); onAccept(s.value); }}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer",
            background: i === ac.selectedIdx ? "#fff5f2" : "#fff",
          }}
        >
          <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "#171b1f", minWidth: 0 }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{s.meta}</span>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, flexShrink: 0, ...AC_BADGE_STYLE[s.type] }}>{AC_BADGE_LABEL[s.type]}</span>
        </div>
      ))}
    </div>
  );
}
