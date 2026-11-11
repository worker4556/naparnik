// Базовые блоки интерфейса. Плоско, как на start.avito.ru: линии 2 px, серые плашки, без теней и скруглений.
import type { ReactNode } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { brand } from "../theme";
import { statusOf, type Tone } from "../helpers";

/** Плашка статуса: цвет + слово. */
export const StatusTag = ({ status, label }: { status: string; label?: string }) => {
  const { t } = useTheme();
  const s = statusOf(status);
  const bg: Record<Tone, string> = { ok: t.okSoft, bad: t.badSoft, wait: t.waitSoft, today: t.todaySoft, neutral: t.surface };
  const dot: Record<Tone, string> = { ok: brand.green, bad: brand.red, wait: brand.blue, today: brand.blue, neutral: t.muted };
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, py: 0.25, bgcolor: bg[s.tone], color: "text.primary", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
      <Box component="span" aria-hidden sx={{ width: 6, height: 6, bgcolor: dot[s.tone], flex: "none" }} />
      {label ?? s.label}
    </Box>
  );
};

/** Заголовок экрана: строка контекста + одна фраза о главном. Без гигантских приветствий. */
export const PageHead = ({ context, title, action }: { context?: string; title: string; action?: ReactNode }) => (
  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "flex-end" }} gap={2} sx={{ mb: { xs: 3, md: 4 } }}>
    <Box>
      {context && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 1.5, fontWeight: 600, fontSize: 14, lineHeight: 1.4, "&::first-letter": { textTransform: "uppercase" } }}
        >
          {context}
        </Typography>
      )}
      <Typography variant="h1" component="h1" sx={{ textWrap: "balance" }}>{title}</Typography>
    </Box>
    {action && <Stack direction="row" gap={1} flexWrap="wrap">{action}</Stack>}
  </Stack>
);

/** Блок-секция Akita: серая плашка (surface) на белом холсте. tone оставляем для совместимости — визуально все плашки одинаковые. */
export const Block = ({ title, aside, children, tone: _tone }: { title: string; aside?: ReactNode; children: ReactNode; tone?: "surface" }) => {
  const { t } = useTheme();
  return (
    <Box component="section" sx={{ bgcolor: t.surface, p: { xs: 2.5, md: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={2} mb={2.5}>
        <Typography variant="h2" component="h2">{title}</Typography>
        {aside}
      </Stack>
      {children}
    </Box>
  );
};

/** Строка списка (list item Akita): padding 16×16 внутри зоны клика, gap 12. */
export const Row = ({ start, title, sub, end, onClick, sx }: {
  start?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; onClick?: () => void; sx?: object;
}) => {
  const { t } = useTheme();
  return (
    <Stack direction="row" alignItems="center" gap={1.5}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      sx={{
        py: 2, gap: 1.5, borderBottom: `1px solid ${t.line}`,
        "&:last-child": { borderBottom: "none" },
        ...(onClick ? { cursor: "pointer", "&:hover": { bgcolor: t.surfaceHover } } : {}),
        ...sx,
      }}>
      {start}
      <Box flex={1} minWidth={0}>
        <Typography fontWeight={500} sx={{ overflowWrap: "anywhere" }}>{title}</Typography>
        {sub && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{sub}</Typography>}
      </Box>
      {end && <Stack direction="row" alignItems="center" gap={1} flex="none">{end}</Stack>}
    </Stack>
  );
};

/** Плоские фигуры в цветах логотипа — вместо «искорок» в пустых состояниях. */
export const Shapes = ({ variant = 0, size = 72 }: { variant?: number; size?: number }) => {
  const sets = [
    [<rect key="a" x="8" y="8" width="36" height="36" fill={brand.blueLight} />, <rect key="b" x="28" y="8" width="16" height="16" fill={brand.blue} />, <rect key="c" x="44" y="40" width="20" height="20" fill={brand.green} />],
    [<rect key="a" x="12" y="10" width="20" height="20" fill={brand.red} />, <rect key="b" x="12" y="30" width="20" height="20" fill={brand.violet} />, <rect key="c" x="38" y="22" width="18" height="18" fill={brand.blue} transform="rotate(15 47 31)" />],
    [<rect key="a" x="18" y="18" width="30" height="30" fill={brand.green} transform="rotate(45 33 33)" />, <rect key="b" x="40" y="8" width="16" height="16" fill={brand.violet} />],
  ];
  return <Box component="svg" viewBox="0 0 72 72" aria-hidden sx={{ width: size, height: size, flex: "none" }}>{sets[variant % sets.length]}</Box>;
};

/** Пустое состояние: больше воздуха внутри плашки, иконка и текст в одной вертикали. */
export const Empty = ({ text, action, variant }: { text: string; action?: ReactNode; variant?: number }) => (
  <Stack direction="row" alignItems="flex-start" gap={2.5} sx={{ py: { xs: 2, md: 3 } }}>
    <Shapes variant={variant} size={56} />
    <Box sx={{ pt: 0.5, minWidth: 0 }}>
      <Typography sx={{ textWrap: "balance" }}>{text}</Typography>
      {action && <Box mt={2}>{action}</Box>}
    </Box>
  </Stack>
);

/** Метка «это сделал Напарник»: фиолетовый — цвет ИИ во всём интерфейсе. */
export const AiTag = ({ children = "Напарник" }: { children?: ReactNode }) => {
  const { t } = useTheme();
  return <Box component="span" sx={{ px: 0.75, py: 0.1, bgcolor: t.aiSoft, color: t.ai, fontSize: 12, fontWeight: 700 }}>{children}</Box>;
};

export const TestLabel = () => {
  const { t } = useTheme();
  return <Box component="span" sx={{ px: 0.75, py: 0.1, border: `1px solid ${t.line}`, color: "text.secondary", fontSize: 12 }}>тестовая инструкция, не регламент Авито</Box>;
};
