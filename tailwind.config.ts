import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f1f1f1",
        surface: "#ffffff",
        accent: "#d44000",
        "accent-strong": "#e44700",
        "accent-dim": "rgba(212,64,0,0.10)",
        text: "#1f2428",
        muted: "#7b7f82",
        danger: "#c81e1e",
        warn: "#f28a00",
        "cal-dark": "#0d0d0d",
      },
      fontFamily: {
        sans: ["DM Sans", "Helvetica Neue", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        xl2: "18px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 6px 18px rgba(0,0,0,0.045)",
        "card-hover": "0 10px 28px rgba(0,0,0,0.08)",
        "cal-header": "0 16px 38px rgba(0,0,0,0.18)",
        "bottom-nav": "0 16px 38px rgba(0,0,0,0.28)",
      },
      backgroundImage: {
        "cal-header":
          "radial-gradient(circle at 18% 8%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg,#050505 0%,#171717 58%,#101010 100%)",
        "bottom-nav": "linear-gradient(180deg,#222 0%,#111 100%)",
        "ai-card": "linear-gradient(135deg,#222622 0%,#3d443d 48%,#1d211e 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
