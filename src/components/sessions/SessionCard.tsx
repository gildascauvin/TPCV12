"use client";

import { cn } from "@/lib/utils";
import type { Session } from "@/types";

interface SessionCardProps {
  session: Session;
  onComplete?: (session: Session) => void;
  onEdit?: (session: Session) => void;
  onDelete?: (session: Session) => void;
}

export default function SessionCard({
  session,
  onComplete,
  onEdit,
  onDelete,
}: SessionCardProps) {
  return (
    <div
      className={cn(
        "rounded-[12px] border p-3 transition-all duration-150 mb-2",
        session.done
          ? "border-[rgba(45,125,22,0.16)] bg-white"
          : "border-[rgba(212,64,0,0.16)] bg-white"
      )}
      style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.045)" }}
    >
      <div className="flex items-start justify-between gap-[5px] mb-1">
        <span className="text-[13px] font-bold text-text leading-snug">{session.name}</span>
        <span
          className={cn(
            "text-[10px] font-bold px-[6px] py-[2px] rounded-full whitespace-nowrap",
            session.done
              ? "bg-[#e8f6df] text-[#2d7d16]"
              : "bg-[#fff0e9] text-accent"
          )}
        >
          {session.done ? "Fait" : "Prévu"}
        </span>
      </div>

      {session.notes && (
        <p className="text-[11px] text-muted italic leading-snug mb-2" style={{ whiteSpace: "pre-wrap" }}>
          {session.notes}
        </p>
      )}

      {session.done && (session.duration || session.rpe) && (
        <div className="grid grid-cols-2 gap-1 mb-2">
          {session.duration && (
            <div className="bg-[#f5f5f5] rounded-[7px] p-[5px] text-center">
              <div className="text-[12px] font-bold text-accent">{session.duration}</div>
              <div className="text-[7px] text-muted tracking-[0.05em] uppercase mt-[2px]">min</div>
            </div>
          )}
          {session.rpe && (
            <div className="bg-[#f5f5f5] rounded-[7px] p-[5px] text-center">
              <div className="text-[12px] font-bold text-accent">{session.rpe}/10</div>
              <div className="text-[7px] text-muted tracking-[0.05em] uppercase mt-[2px]">RPE</div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-[7px] items-center mt-[9px]">
        {!session.done && onComplete && (
          <button
            onClick={() => onComplete(session)}
            className="btn-primary text-[11px] px-3 py-[6px] rounded-[10px]"
          >
            Terminer ✓
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(session)}
            className="btn-secondary text-[11px] px-3 py-[6px] rounded-[10px]"
          >
            Modifier
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(session)}
            className="text-[11px] px-3 py-[5px] rounded-[10px] border"
            style={{ background: "#fff", color: "#c81e1e", borderColor: "rgba(200,30,30,0.28)" }}
          >
            Suppr.
          </button>
        )}
      </div>
    </div>
  );
}
