import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "yallpos_theme";

type ThemeContextValue = {
  dark: boolean;
  setDark: (value: boolean) => void;
  toggleDark: () => void;
  productCardBg: (categoryColor?: string) => string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDarkState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const value = useMemo<ThemeContextValue>(() => ({
    dark,
    setDark: setDarkState,
    toggleDark: () => setDarkState((v) => !v),
    productCardBg: (categoryColor?: string) => {
      if (!categoryColor) return "var(--t-card)";
      return dark ? `${categoryColor}40` : `${categoryColor}22`;
    },
  }), [dark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

/** Estilos comunes reutilizables en vistas POS */
export const ui = {
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--t-border-strong)",
    background: "var(--t-input-bg)",
    color: "var(--t-input-fg)",
    fontSize: 14,
    boxSizing: "border-box" as const,
  },
  card: {
    background: "var(--t-card)",
    border: "1px solid var(--t-border)",
    borderRadius: 12,
  },
  panel: {
    background: "var(--t-card-alt)",
    border: "1px solid var(--t-border-strong)",
    borderRadius: 12,
  },
  btnSecondary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid var(--t-border-strong)",
    background: "var(--t-card)",
    color: "var(--t-fg)",
    cursor: "pointer",
    fontSize: 13,
  },
  btnPrimary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "var(--t-primary)",
    color: "var(--t-primary-fg)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  muted: { color: "var(--t-muted)" },
  successFg: { color: "var(--t-success-fg)" },
  warnFg: { color: "var(--t-warn-fg)" },
  dangerFg: { color: "var(--t-danger-fg)" },
  link: { color: "var(--t-link)" },
} as const;

/** Colores semánticos para estilos inline */
export const tc = {
  fg: "var(--t-fg)",
  muted: "var(--t-muted)",
  card: "var(--t-card)",
  success: "var(--t-success-fg)",
  warn: "var(--t-warn-fg)",
  danger: "var(--t-danger-fg)",
  green: "var(--t-green-fg)",
  red: "var(--t-red-fg)",
  orange: "var(--t-orange-fg)",
  link: "var(--t-link)",
  accent: "var(--t-accent-fg)",
  primary: "var(--t-primary)",
  primaryFg: "var(--t-primary-fg)",
} as const;
