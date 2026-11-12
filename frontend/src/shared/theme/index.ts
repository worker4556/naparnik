// Токены Напарника — по логике дизайн-системы Авито (Хабр, «Как устроена библиотека дизайн-системы Авито»):
// именованные цвета и тексты, «наугад ничего не берём». Палитра — цвета логотипа Авито и нейтральные
// с сайта start.avito.ru: чёрный текст, серые плашки, линии 1–2 px, без скруглений и теней.
// Контраст: синий #00AAFF — только заливкой под чёрным (8.2:1); ссылки — #0A7BC2 (4.5:1).
import { createTheme, type Theme } from "@mui/material";

export type Mode = "light" | "dark";

// ---------- Brand (логотип Авито, не зависят от темы) ----------
export const brand = {
  blue: "#00AAFF",
  blueLight: "#BADAFB",
  green: "#04E061",
  red: "#FF4053",
  violet: "#965EEB",
  amber: "#E5A000",
  amberSoft: "#FFF3D6",
} as const;

// ---------- Space (4-pt grid, как у Akita) ----------
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
} as const;

// ---------- Type ----------
export const font = '"Onest", "Golos Text", system-ui, -apple-system, "Segoe UI", sans-serif';

export const type = {
  family: font,
  weight: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 } as const,
  size: {
    xs: 12,
    sm: 13,
    md: 14,
    base: 15,
    lg: 16,
    xl: 17,
    h3: 17,
    h2: 22,
    h1: "clamp(32px, 5vw, 44px)",
    display: 32,
    displayMd: 28,
    displayLg: 56,
  } as const,
  line: { tight: 1.15, snug: 1.25, normal: 1.45, relaxed: 1.5 } as const,
  tracking: { tight: "-0.025em", snug: "-0.02em", display: "-0.03em", normal: "-0.01em" } as const,
} as const;

// ---------- Layout / control sizes ----------
export const size = {
  header: 64,
  control: 44,
  controlSm: 36,
  icon: 44,
  avatar: 32,
  avatarSm: 28,
  badge: 22,
  progress: 8,
  drawer: 440,
  mascot: 96,
  mascotSm: 72,
} as const;

// ---------- Stroke / radius ----------
export const stroke = { hairline: 1, thick: 2, accent: 4 } as const;
export const radius = 0;

// ---------- Motion ----------
export const motion = {
  fast: "0.15s ease",
  base: "0.2s ease",
  breathe: "5s ease-in-out infinite",
} as const;

// ---------- Semantic colors (theme-dependent) ----------
export type ColorTokens = {
  bg: string; surface: string; surfaceHover: string; line: string; text: string; muted: string;
  link: string; inverse: string; onInverse: string; inverseHover: string;
  ai: string; aiSoft: string; okSoft: string; badSoft: string; waitSoft: string; todaySoft: string;
  /** Пастели папок KB — под text текущей темы (≥4.5:1). */
  folderSoft: readonly [string, string, string, string, string, string];
  folderDot: readonly [string, string, string, string, string, string];
};

export const tokens: Record<Mode, ColorTokens> = {
  light: {
    bg: "#FFFFFF", surface: "#F4F4F4", surfaceHover: "#EBEBEB", line: "#E7E9E8", text: "#000000", muted: "#626362",
    link: "#0A7BC2", inverse: "#000000", onInverse: "#FFFFFF", inverseHover: "#262626",
    ai: "#6A35C9", aiSoft: "#EFE7FC", okSoft: "#D9F9E6", badSoft: "#FFE3E6", waitSoft: "#E3EFFD", todaySoft: brand.blueLight,
    folderSoft: [brand.blueLight, "#D9F9E6", "#EFE7FC", "#FFE3E6", brand.amberSoft, "#E3EFFD"],
    folderDot: [brand.blue, brand.green, brand.violet, brand.red, brand.amber, brand.blue],
  },
  dark: {
    // Soft светлее surface; текст #F3F3F3 ≥ 8:1 на soft (WCAG AAA).
    bg: "#0F0F0F", surface: "#1C1C1C", surfaceHover: "#2A2A2A", line: "#3D3D3D", text: "#F3F3F3", muted: "#BDBDBD",
    link: "#5CC6FF", inverse: "#FFFFFF", onInverse: "#000000", inverseHover: "#D9D9D9",
    ai: "#C3A2F7", aiSoft: "#35284F", okSoft: "#1E3F2C", badSoft: "#4A242A", waitSoft: "#243A52", todaySoft: "#1E4A6E",
    folderSoft: ["#1E4A6E", "#1E3F2C", "#35284F", "#4A242A", "#4A3A14", "#243A52"],
    folderDot: [brand.blue, brand.green, brand.violet, brand.red, brand.amber, brand.blue],
  },
};

declare module "@mui/material/styles" {
  interface Theme {
    t: ColorTokens;
    space: typeof space;
    type: typeof type;
    size: typeof size;
    stroke: typeof stroke;
    motion: typeof motion;
  }
  interface ThemeOptions {
    t?: ColorTokens;
    space?: typeof space;
    type?: typeof type;
    size?: typeof size;
    stroke?: typeof stroke;
    motion?: typeof motion;
  }
}

/** CSS-переменные на :root / [data-theme] — для не-MUI мест и инспектора. */
export const cssVars = (mode: Mode): Record<string, string> => {
  const c = tokens[mode];
  return {
    "--nap-bg": c.bg,
    "--nap-surface": c.surface,
    "--nap-surface-hover": c.surfaceHover,
    "--nap-line": c.line,
    "--nap-text": c.text,
    "--nap-muted": c.muted,
    "--nap-link": c.link,
    "--nap-inverse": c.inverse,
    "--nap-on-inverse": c.onInverse,
    "--nap-ai": c.ai,
    "--nap-ai-soft": c.aiSoft,
    "--nap-ok-soft": c.okSoft,
    "--nap-bad-soft": c.badSoft,
    "--nap-wait-soft": c.waitSoft,
    "--nap-today-soft": c.todaySoft,
    "--nap-blue": brand.blue,
    "--nap-green": brand.green,
    "--nap-red": brand.red,
    "--nap-violet": brand.violet,
    "--nap-font": font,
    "--nap-radius": `${radius}px`,
    "--nap-stroke": `${stroke.thick}px`,
    "--nap-stroke-thin": `${stroke.hairline}px`,
    "--nap-space-1": `${space[1]}px`,
    "--nap-space-2": `${space[2]}px`,
    "--nap-space-3": `${space[3]}px`,
    "--nap-space-4": `${space[4]}px`,
    "--nap-space-5": `${space[5]}px`,
    "--nap-space-6": `${space[6]}px`,
    "--nap-control": `${size.control}px`,
    "--nap-header": `${size.header}px`,
  };
};

export const makeTheme = (mode: Mode): Theme => {
  const t = tokens[mode];
  const vars = cssVars(mode);
  return createTheme({
    t,
    space,
    type,
    size,
    stroke,
    motion,
    palette: {
      mode,
      primary: { main: t.inverse, contrastText: t.onInverse },
      secondary: { main: mode === "dark" ? t.ai : brand.violet },
      success: { main: brand.green, contrastText: "#000" },
      error: { main: brand.red, contrastText: "#000" },
      background: { default: t.bg, paper: t.bg },
      text: { primary: t.text, secondary: t.muted },
      divider: t.line,
    },
    shape: { borderRadius: radius },
    typography: {
      fontFamily: type.family,
      fontSize: type.size.base,
      h1: { fontSize: type.size.h1, fontWeight: type.weight.semibold, letterSpacing: type.tracking.tight, lineHeight: type.line.tight },
      h2: { fontSize: type.size.h2, fontWeight: type.weight.semibold, letterSpacing: type.tracking.normal, lineHeight: type.line.snug },
      h3: { fontSize: type.size.h3, fontWeight: type.weight.semibold, lineHeight: 1.3 },
      body1: { fontSize: type.size.lg, lineHeight: type.line.relaxed },
      body2: { fontSize: type.size.md, lineHeight: type.line.normal },
      caption: { fontSize: type.size.sm, lineHeight: 1.4 },
      button: { textTransform: "none", fontWeight: type.weight.semibold, fontSize: type.size.base },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": vars,
          body: {
            backgroundColor: t.bg,
            color: t.text,
            fontFamily: type.family,
            ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v])),
          },
          "a, button, [role=button], label[for], input[type=checkbox]": { cursor: "pointer" },
          ":focus-visible": { outline: `${stroke.thick}px solid ${t.link}`, outlineOffset: 2 },
          "@media (prefers-reduced-motion: reduce)": { "*": { animation: "none !important", transition: "none !important" } },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: {
            borderRadius: radius,
            minHeight: size.control,
            padding: `${space[2] + 2}px ${space[4] + 2}px`,
            transition: `background-color ${motion.fast}`,
          },
          containedPrimary: { "&:hover": { backgroundColor: t.inverseHover } },
          text: { color: t.text, backgroundColor: t.surface, "&:hover": { backgroundColor: t.surfaceHover } },
          outlined: {
            borderWidth: stroke.thick, borderColor: t.line, color: t.text,
            "&:hover": { borderWidth: stroke.thick, borderColor: t.text, backgroundColor: "transparent" },
          },
        },
      },
      MuiIconButton: {
        defaultProps: { disableRipple: true },
        styleOverrides: {
          root: { borderRadius: radius, width: size.icon, height: size.icon, "&:hover": { backgroundColor: t.surface } },
        },
      },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: "none" } } },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: radius, border: `${stroke.thick}px solid ${t.line}` } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius, backgroundColor: t.surface,
            "& fieldset": { border: "none" },
            "&.Mui-focused": { outline: `${stroke.thick}px solid ${t.text}` },
          },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { color: t.muted } } },
      MuiChip: { styleOverrides: { root: { borderRadius: radius, fontWeight: type.weight.semibold } } },
      MuiCheckbox: {
        defaultProps: { disableRipple: true },
        styleOverrides: { root: { color: t.muted, "&.Mui-checked": { color: t.text } } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 6, borderRadius: radius, backgroundColor: t.surface },
          bar: { backgroundColor: brand.green },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: { borderRadius: radius, backgroundColor: t.inverse, color: t.onInverse, fontFamily: type.family },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: radius, backgroundColor: t.inverse, color: t.onInverse, fontSize: type.size.sm },
        },
      },
      MuiMenu: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          paper: { borderRadius: radius, border: `${stroke.thick}px solid ${t.line}`, boxShadow: "none" },
          list: { padding: `${space[2]}px 0` },
        },
      },
      MuiMenuItem: {
        defaultProps: { disableRipple: true },
        styleOverrides: {
          root: { minHeight: space[9], padding: `${space[3]}px ${space[4]}px`, gap: space[3], "&:hover": { backgroundColor: t.surface } },
        },
      },
      MuiPopover: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          paper: { borderRadius: radius, border: `${stroke.thick}px solid ${t.line}`, boxShadow: "none" },
        },
      },
    },
  });
};
