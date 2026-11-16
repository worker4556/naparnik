// Где стоит маскот (08-DESIGN §2.5, 07-FRONTEND §10): перетаскивается в любое место у края экрана и при
// отпускании прилипает к ближайшему краю; свёрнут до точки или скрыт на час. Всё запоминается для человека.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MascotEdge } from "./types";

export type Placement = { edge: MascotEdge; bottom: number; minimized: boolean; hiddenUntil: number };

const DRAG_PX = 6; // меньше — это клик, а не перетаскивание
const LONG_PRESS_MS = 600;
const HOUR = 60 * 60 * 1000;
const key = (login: string) => `naparnik.mascot.place.${login}`;

const read = (login: string, fallback: Placement): Placement => {
  try {
    const v = JSON.parse(localStorage.getItem(key(login)) ?? "null") as Partial<Placement> | null;
    return v ? { ...fallback, ...v } : fallback;
  } catch { return fallback; }
};

/** Отступ снизу в допустимых пределах: не под нижней навигацией и не выше шапки. */
export const clampBottom = (bottom: number, size: number, minBottom: number, viewport = window.innerHeight) =>
  Math.round(Math.max(minBottom, Math.min(viewport - size - 80, bottom)));

/** На iPhone нижняя навигация выше из-за safe area — маскот должен подняться вместе с ней. */
export const mascotBottomCss = (bottom: number, mobile: boolean) =>
  mobile ? `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` : `${bottom}px`;

export const useMascotPlacement = (login: string, size: number, minBottom: number) => {
  const fallback: Placement = { edge: "right", bottom: minBottom, minimized: false, hiddenUntil: 0 };
  const [place, setPlace] = useState<Placement>(() => read(login, fallback));
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<{
    x: number; y: number; moved: boolean; press?: ReturnType<typeof setTimeout>;
    target?: Element; pointerId?: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const save = useCallback((next: Placement) => {
    setPlace(next);
    try { localStorage.setItem(key(login), JSON.stringify(next)); } catch { /* приватный режим — до перезагрузки */ }
  }, [login]);

  // При смене учётки / размера экрана / нижней навигации — перечитать и зажать bottom в px.
  useEffect(() => {
    const apply = () => {
      const next = read(login, { edge: "right", bottom: minBottom, minimized: false, hiddenUntil: 0 });
      const bottom = clampBottom(next.bottom, size, minBottom);
      const fixed = bottom === next.bottom ? next : { ...next, bottom };
      setPlace(fixed);
      if (bottom !== next.bottom) {
        try { localStorage.setItem(key(login), JSON.stringify(fixed)); } catch { /* приватный режим */ }
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [login, size, minBottom]);

  // «Скрыть на час» — по истечении часа маскот возвращается сам.
  const hidden = place.hiddenUntil > Date.now();
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setPlace((p) => ({ ...p })), place.hiddenUntil - Date.now() + 50);
    return () => clearTimeout(t);
  }, [hidden, place.hiddenUntil]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const press = e.pointerType === "touch" ? setTimeout(() => { gesture.current = null; setMenuAt({ x: e.clientX, y: e.clientY }); suppressClick.current = true; }, LONG_PRESS_MS) : undefined;
    // Не захватываем pointer сразу — иначе на мобилке ломается скролл страницы с маскота.
    gesture.current = { x: e.clientX, y: e.clientY, moved: false, press, target: e.currentTarget as Element, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_PX) return;
    if (!g.moved) {
      g.moved = true;
      clearTimeout(g.press);
      if (g.target && g.pointerId != null) g.target.setPointerCapture(g.pointerId);
    }
    setDrag({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.press);
    if (g.moved && g.target && g.pointerId != null) g.target.releasePointerCapture(g.pointerId);
    if (!g.moved) return;
    suppressClick.current = true; // это было перетаскивание, а не клик
    setDrag(null);
    save({ ...place, edge: e.clientX < window.innerWidth / 2 ? "left" : "right", bottom: clampBottom(window.innerHeight - e.clientY - size / 2, size, minBottom) });
  };
  /** Клик после перетаскивания или долгого нажатия не открывает чат. */
  const consumeClick = () => {
    const skip = suppressClick.current;
    suppressClick.current = false;
    return skip;
  };

  return {
    place, hidden, drag, menuAt,
    handlers: {
      onPointerDown, onPointerMove, onPointerUp,
      onPointerCancel: () => {
        const g = gesture.current;
        if (g?.moved && g.target && g.pointerId != null) g.target.releasePointerCapture?.(g.pointerId);
        clearTimeout(g?.press);
        gesture.current = null;
        setDrag(null);
      },
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setMenuAt({ x: e.clientX, y: e.clientY }); },
    },
    consumeClick,
    closeMenu: () => setMenuAt(null),
    minimize: (on: boolean) => save({ ...place, minimized: on }),
    hideForHour: () => save({ ...place, hiddenUntil: Date.now() + HOUR }),
    show: () => save({ ...place, hiddenUntil: 0 }),
    reset: () => save(fallback),
  };
};
