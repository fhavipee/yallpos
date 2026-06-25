import { useEffect, useRef } from "react";

type SwipeOptions = {
  enabled?: boolean;
  minDistance?: number;
};

/** Deslizar izquierda/derecha para cambiar entre pestañas (móvil/tablet). */
export function useSwipeTabs<T extends string>(
  tabs: readonly T[],
  active: T,
  onChange: (tab: T) => void,
  options: SwipeOptions = {},
) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled = true, minDistance = 72 } = options;

  useEffect(() => {
    if (!enabled || tabs.length < 2) return;
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const idx = tabs.indexOf(active);
      if (idx < 0) return;

      if (dx < 0 && idx < tabs.length - 1) onChange(tabs[idx + 1]);
      else if (dx > 0 && idx > 0) onChange(tabs[idx - 1]);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [tabs, active, onChange, enabled, minDistance]);

  return ref;
}
