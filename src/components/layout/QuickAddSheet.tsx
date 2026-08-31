"use client";

import Link from "next/link";

interface QuickAddOption {
  label: string;
  icon: string;
  href: string;
}

interface Props {
  options: QuickAddOption[];
  onClose: () => void;
}

export default function QuickAddSheet({ options, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483050,
        background: "rgba(0,0,0,.34)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(420px,calc(100vw - 28px))",
          marginBottom: "calc(104px + env(safe-area-inset-bottom,0px))",
          background: "#fff",
          borderRadius: 24,
          padding: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,.28)",
          animation: "sheetInUp 0.18s ease",
        }}
      >
        {options.map(opt => (
          <Link
            key={opt.href}
            href={opt.href}
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 14px",
              borderRadius: 16,
              textDecoration: "none",
              color: "#171b1f",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                background: "#f7f8f9",
                flexShrink: 0,
              }}
            >
              {opt.icon}
            </span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{opt.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
