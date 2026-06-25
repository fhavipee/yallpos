import { useEffect, useRef } from "react";

/**
 * Escucha lectores de código de barras USB (modo teclado).
 * Acumula caracteres rápidos y dispara onScan al presionar Enter.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const buffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime.current > 100) buffer.current = "";
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code.length >= 3) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onScan, enabled]);
}
