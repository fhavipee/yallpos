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
  const [dark, setDarkState] = useState(() => localStorage.getItem(STORAGE_KEY) === "dark");

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
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  muted: { color: "var(--t-muted)" },
} as const;
