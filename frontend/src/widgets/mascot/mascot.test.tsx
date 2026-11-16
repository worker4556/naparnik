// Маскот (08-DESIGN §2.2–2.6, BR-90, BR-91, SC-25): таймеры дремоты и сна, пробуждение, реакции на события,
// приветствие раз в день, кадры состояний.
import { act, render, renderHook, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTheme } from "@/shared/theme";
import { MASCOT_TIMERS } from "@/shared/config/mascot";
import { Mascot3D, mascotBottomCss, moodLabel, useMascotMood, type MascotMood } from "@/widgets/mascot";

const sec = (s: number) => act(() => { vi.advanceTimersByTime(s * 1000); });
const move = () => act(() => { window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10 })); });

beforeEach(() => { vi.useFakeTimers(); localStorage.setItem("naparnik.mascot.greeting", String(Date.now())); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe("useMascotMood", () => {
  it("дремлет через 2 минуты, засыпает через 3, просыпается от движения", () => {
    const { result } = renderHook(() => useMascotMood({}));
    expect(result.current.mood).toBe("idle");
    sec(MASCOT_TIMERS.drowsyAfterSec);
    expect(result.current.mood).toBe("drowsy");
    sec(MASCOT_TIMERS.sleepAfterSec - MASCOT_TIMERS.drowsyAfterSec);
    expect(result.current.mood).toBe("sleeping");
    move();
    expect(result.current.mood).toBe("waking");
    sec(1);
    expect(result.current.mood).toBe("idle");
  });

  it("событие будит одной короткой реакцией, дальше — статичный кадр; без действий всё равно засыпает", () => {
    const { result, rerender } = renderHook((p: Parameters<typeof useMascotMood>[0]) => useMascotMood(p), { initialProps: {} });
    sec(MASCOT_TIMERS.sleepAfterSec);
    expect(result.current.mood).toBe("sleeping");
    rerender({ hasAnswer: true });
    expect(result.current.mood).toBe("has_answer");
    sec(2);
    expect(result.current.mood).toBe("has_answer");
    sec(MASCOT_TIMERS.sleepAfterSec);
    expect(result.current.mood).toBe("sleeping");
  });

  it("приоритет: думает → ошибка → ответ → черновик → напоминание", () => {
    const { result, rerender } = renderHook((p: Parameters<typeof useMascotMood>[0]) => useMascotMood(p), { initialProps: { reminder: true } as Parameters<typeof useMascotMood>[0] });
    expect(result.current.mood).toBe("reminder");
    rerender({ reminder: true, needsConfirm: true });
    expect(result.current.mood).toBe("needs_confirm");
    rerender({ reminder: true, needsConfirm: true, error: true });
    expect(result.current.mood).toBe("error");
    rerender({ reminder: true, needsConfirm: true, error: true, thinking: true });
    expect(result.current.mood).toBe("thinking");
  });

  it("приветствие — первое открытие за день и не чаще раза в час", () => {
    localStorage.removeItem("naparnik.mascot.greeting");
    const first = renderHook(() => useMascotMood({}));
    expect(first.result.current.mood).toBe("greeting");
    sec(2);
    expect(first.result.current.mood).toBe("idle");
    const again = renderHook(() => useMascotMood({}));
    expect(again.result.current.mood).toBe("idle");
  });

  it("каждое состояние подписано текстом (доступность)", () => {
    const moods: MascotMood[] = ["idle", "drowsy", "sleeping", "waking", "greeting", "thinking", "has_answer", "reminder", "needs_confirm", "error", "minimized"];
    for (const m of moods) expect(moodLabel(m)).toBeTruthy();
    expect(moodLabel("sleeping")).toBe("Сплю. Нажми, если нужен");
  });
});

describe("Mascot3D", () => {
  const draw = (mood: MascotMood) => render(<ThemeProvider theme={makeTheme("light")}><Mascot3D size={96} mood={mood} badge={<span>1</span>} /></ThemeProvider>);

  it("сон: веки закрыты и «z z Z»; дремота: веки полуприкрыты; думает: облачко «…»", () => {
    const { container, unmount } = draw("sleeping");
    expect(container.querySelector('[data-eyes="closed"]')).not.toBeNull();
    expect(screen.getByText("Z")).toBeInTheDocument();
    unmount();
    const drowsy = draw("drowsy");
    expect(drowsy.container.querySelector('[data-eyes="half"]')).not.toBeNull();
    expect(drowsy.container.querySelector('[data-eyes-half="true"]')).not.toBeNull();
    drowsy.unmount();
    const thinking = draw("thinking");
    expect(thinking.container.querySelectorAll('[data-mood="thinking"] span').length).toBeGreaterThanOrEqual(3);
  });

  it("есть письмо или важное — машет письмом (у напоминания — с «!»), во сне лапа опущена", () => {
    const answer = draw("has_answer");
    expect(answer.container.querySelector('[data-letter="letter"]')).not.toBeNull();
    expect(answer.container.querySelector('[data-paw="has_answer"]')).not.toBeNull();
    answer.unmount();
    const reminder = draw("reminder");
    expect(reminder.container.querySelector('[data-letter="alert"]')).not.toBeNull();
    reminder.unmount();
    const idle = draw("idle");
    expect(idle.container.querySelector("[data-letter]")).toBeNull();
    idle.unmount();
    // Бейдж уведомлений → письмо даже в idle (машет, пока есть urgent).
    const withMail = render(<ThemeProvider theme={makeTheme("light")}><Mascot3D size={96} mood="idle" mail /></ThemeProvider>);
    expect(withMail.container.querySelector('[data-letter="alert"]')).not.toBeNull();
    withMail.unmount();
    const sleeping = draw("sleeping");
    expect(sleeping.container.querySelector("[data-letter]")).toBeNull();
    // Во сне ложится: появляются подушка и одеяло; проснувшись — убираются
    expect(sleeping.container.querySelector('[data-pillow="true"]')).not.toBeNull();
    expect(sleeping.container.querySelector('[data-blanket="true"]')).not.toBeNull();
    sleeping.unmount();
    const awake = draw("idle");
    expect(awake.container.querySelector('[data-blanket="false"]')).not.toBeNull();
  });

});

describe("позиция маскота", () => {
  it("на мобильном поднимается над safe area нижней навигации", () => {
    expect(mascotBottomCss(80, true)).toBe("calc(80px + env(safe-area-inset-bottom, 0px))");
    expect(mascotBottomCss(20, false)).toBe("20px");
  });
});
