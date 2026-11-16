// Базовые блоки интерфейса. Плоско, как на start.avito.ru: линии 2 px, серые плашки, без теней и скруглений.
import type { ReactNode } from "react";
import { Box, IconButton, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { ArrowBackOutlined, CloseOutlined } from "@mui/icons-material";
import { brand } from "@/shared/theme";
import { statusOf, type Tone } from "@/shared/lib";

/**
 * Крестик закрытия модалки — справа в шапке.
 * Правый край совпадает с нижней кнопкой DialogActions (общий pr: 16px).
 */
export const DialogClose = ({ onClose }: { onClose: () => void }) => {
  const { size } = useTheme();
  return (
    <IconButton
      aria-label="Закрыть"
      onClick={onClose}
      sx={{
        flex: "none",
        alignSelf: "flex-start",
        width: size.icon,
        height: size.icon,
        p: 0,
        m: 0,
        "& .MuiSvgIcon-root": { fontSize: 22, display: "block" },
      }}
    >
      <CloseOutlined />
    </IconButton>
  );
};

/** Стрелка «назад» — на мобилке из вложенного экрана (профиль/настройки → аккаунт). */
export const DialogBack = ({ onBack, label = "Назад" }: { onBack: () => void; label?: string }) => {
  const { size } = useTheme();
  return (
    <IconButton
      aria-label={label}
      onClick={onBack}
      sx={{
        flex: "none",
        alignSelf: "flex-start",
        width: size.icon,
        height: size.icon,
        p: 0,
        m: 0,
        "& .MuiSvgIcon-root": { fontSize: 22, display: "block" },
      }}
    >
      <ArrowBackOutlined />
    </IconButton>
  );
};

/**
 * Шапка DialogTitle + крестик.
 * pr: 2 (16px) = DialogActions p: 2 — правый край крестика = правый край нижней кнопки.
 * pl: 3 (24px) = штатный отступ контента.
 */
export const dialogTitleSx = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 1,
  pl: 3,
  pr: 2,
  pt: 2,
  pb: 1.5,
} as const;

/** Плашка статуса: цвет + слово. */
export const StatusTag = ({ status, label }: { status: string; label?: string }) => {
  const { t, type, space } = useTheme();
  const s = statusOf(status);
  const bg: Record<Tone, string> = { ok: t.okSoft, bad: t.badSoft, wait: t.waitSoft, today: t.todaySoft, neutral: t.surface };
  const dot: Record<Tone, string> = { ok: brand.green, bad: brand.red, wait: brand.blue, today: brand.blue, neutral: t.muted };
  return (
    <Box component="span" sx={{
      display: "inline-flex",
      alignItems: "center",
      width: "fit-content",
      maxWidth: "100%",
      gap: `${space[1] + 2}px`,
      px: `${space[2]}px`,
      py: 0.25,
      bgcolor: bg[s.tone],
      color: "text.primary",
      fontSize: type.size.sm,
      fontWeight: type.weight.semibold,
      whiteSpace: "nowrap",
    }}>
      <Box component="span" aria-hidden sx={{ width: 6, height: 6, bgcolor: dot[s.tone], flex: "none" }} />
      {label ?? s.label}
    </Box>
  );
};

/** Заголовок экрана: строка контекста + одна фраза о главном. Без гигантских приветствий. */
export const PageHead = ({ context, title, action }: { context?: string; title: string; action?: ReactNode }) => (
  <Stack
    direction={{ xs: "column", sm: "row" }}
    justifyContent="space-between"
    alignItems={{ xs: "stretch", sm: "flex-end" }}
    gap={{ xs: 1.5, sm: 2 }}
    sx={{ mb: { xs: 2, md: 4 } }}
  >
    <Box minWidth={0}>
      {context && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: { xs: 1, md: 1.5 }, fontWeight: 600, fontSize: 14, lineHeight: 1.4, "&::first-letter": { textTransform: "uppercase" } }}
        >
          {context}
        </Typography>
      )}
      <Typography variant="h1" component="h1" sx={{ textWrap: "balance", fontSize: { xs: "clamp(26px, 7vw, 36px)", md: undefined } }}>{title}</Typography>
    </Box>
    {action && (
      <Stack
        direction="row"
        gap={1}
        flexWrap="wrap"
        sx={{ width: { xs: "100%", sm: "auto" }, "& > .MuiButton-root": { width: { xs: "100%", sm: "auto" } } }}
      >
        {action}
      </Stack>
    )}
  </Stack>
);

/** Блок-секция Akita: серая плашка (surface) на белом холсте. tone оставляем для совместимости — визуально все плашки одинаковые. */
export const Block = ({ title, aside, children, tone: _tone }: { title: ReactNode; aside?: ReactNode; children: ReactNode; tone?: "surface" }) => {
  const { t, space } = useTheme();
  return (
    <Box component="section" sx={{ bgcolor: t.surface, p: { xs: `${space[4]}px`, md: `${space[6]}px` } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "baseline" }}
        gap={{ xs: `${space[2]}px`, sm: `${space[3]}px` }}
        mb={{ xs: `${space[3]}px`, md: `${space[5]}px` }}
      >
        {typeof title === "string" || typeof title === "number" ? (
          <Typography variant="h2" component="h2" sx={{ textWrap: "balance", fontSize: { xs: 20, md: undefined } }}>{title}</Typography>
        ) : title}
        {aside}
      </Stack>
      {children}
    </Box>
  );
};

/** Строка списка (list item Akita): padding 16×16 внутри зоны клика, gap 12. */
export const Row = ({ start, title, sub, end, onClick, align = "center", stackEndOnMobile = false, sx }: {
  start?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; onClick?: () => void;
  /** flex-start — для многострочных заголовков (уведомления), чтобы тег не «висел» по центру. */
  align?: "center" | "flex-start";
  /** На узком экране end уходит под текст — для шагов с кнопками. */
  stackEndOnMobile?: boolean;
  sx?: object;
}) => {
  const { t, space, stroke, type } = useTheme();
  return (
    <Stack direction="row" alignItems={align} flexWrap={stackEndOnMobile ? { xs: "wrap", sm: "nowrap" } : undefined}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      sx={{
        px: { xs: `${space[3]}px`, md: `${space[4]}px` },
        py: `${space[4]}px`,
        gap: `${space[3]}px`,
        borderBottom: `${stroke.hairline}px solid ${t.line}`,
        "&:last-child": { borderBottom: "none" },
        ...(onClick ? { cursor: "pointer", "&:hover": { bgcolor: t.surfaceHover } } : {}),
        ...sx,
      }}>
      {start}
      <Box flex={1} minWidth={0}>
        {typeof title === "string" || typeof title === "number" ? (
          <Typography fontWeight={type.weight.medium} sx={{ overflowWrap: "break-word" }}>{title}</Typography>
        ) : title}
        {sub != null && sub !== false && (
          typeof sub === "string" || typeof sub === "number" ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: `${space[1]}px` }}>{sub}</Typography>
          ) : (
            <Box sx={{ mt: `${space[1]}px` }}>{sub}</Box>
          )
        )}
      </Box>
      {end && (
        <Stack
          direction="row"
          alignItems={align === "flex-start" ? "flex-start" : "center"}
          justifyContent="flex-end"
          flexWrap="wrap"
          gap={`${space[2]}px`}
          sx={{
            flex: stackEndOnMobile ? { xs: "1 1 100%", sm: "none" } : "none",
            ml: "auto",
            // Под текстом, вровень с заголовком (чекбокс + gap), без «плывущего» отступа.
            pl: stackEndOnMobile && start ? { xs: `calc(${space[7]}px + ${space[3]}px)`, sm: 0 } : 0,
            ...(align === "flex-start" ? { pt: "2px" } : {}),
          }}
        >
          {end}
        </Stack>
      )}
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
export const Empty = ({ text, action, variant, icon = true }: { text: string; action?: ReactNode; variant?: number; icon?: boolean }) => (
  <Stack direction="row" alignItems="flex-start" gap={{ xs: 2, md: 2.5 }} sx={{ py: { xs: 2, md: 3 } }}>
    {icon && <Shapes variant={variant} size={56} />}
    <Box sx={{ pt: icon ? 0.5 : 0, minWidth: 0, flex: 1 }}>
      <Typography sx={{ textWrap: "balance" }}>{text}</Typography>
      {action && (
        <Box mt={2} sx={{ "& > .MuiButton-root, & > .MuiStack-root > .MuiButton-root": { width: { xs: "100%", sm: "auto" } } }}>
          {action}
        </Box>
      )}
    </Box>
  </Stack>
);

/** Метка «это сделал Напарник»: фиолетовый — цвет ИИ во всём интерфейсе. */
export const AiTag = ({ children = "Напарник" }: { children?: ReactNode }) => {
  const { t, type } = useTheme();
  return <Box component="span" sx={{ px: 0.75, py: 0.1, bgcolor: t.aiSoft, color: t.ai, fontSize: type.size.xs, fontWeight: type.weight.bold }}>{children}</Box>;
};

export const TestLabel = () => {
  const { t, type, stroke } = useTheme();
  return <Box component="span" sx={{ px: 0.75, py: 0.1, border: `${stroke.hairline}px solid ${t.line}`, color: "text.secondary", fontSize: type.size.xs }}>тестовая инструкция, не регламент Авито</Box>;
};

/** Кость скелетона: на белом — surface, внутри плашки — bg. */
export const Bone = ({ w = "100%", h = 16, inPlate }: { w?: number | string; h?: number; inPlate?: boolean }) => {
  const { t } = useTheme();
  return (
    <Box
      aria-hidden
      sx={{
        width: w, height: h, flex: "none", bgcolor: inPlate ? t.bg : t.surface,
        animation: "nap-skel 1.2s ease-in-out infinite",
        "@keyframes nap-skel": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
        "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0.7 },
      }}
    />
  );
};

const SkelPlate = ({ children, titleW = 140 }: { children: ReactNode; titleW?: number }) => {
  const { t } = useTheme();
  return (
    <Box sx={{ bgcolor: t.surface, p: { xs: 2.5, md: 3 } }}>
      <Bone w={titleW} h={22} inPlate />
      <Box sx={{ mt: 2.5 }}>{children}</Box>
    </Box>
  );
};

const SkelRow = ({ inPlate }: { inPlate?: boolean }) => (
  <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 2 }}>
    <Bone w={22} h={22} inPlate={inPlate} />
    <Box flex={1} minWidth={0}>
      <Bone w="72%" h={16} inPlate={inPlate} />
      <Box mt={0.75}><Bone w="40%" h={12} inPlate={inPlate} /></Box>
    </Box>
    <Bone w={72} h={24} inPlate={inPlate} />
  </Stack>
);

const SkelHead = ({ titleW = 280 }: { titleW?: number }) => (
  <Box sx={{ mb: { xs: 3, md: 4 } }}>
    <Bone w={200} h={14} />
    <Box mt={1.5}><Bone w={titleW} h={40} /></Box>
  </Box>
);

/** Скелетон «Мой день»: шапка + сетка как у DayPage (на мобилке путь адаптации внизу). */
export const DaySkeleton = () => {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const today = (
    <SkelPlate titleW={100}>
      <SkelRow inPlate />
      <SkelRow inPlate />
    </SkelPlate>
  );
  const progress = (
    <SkelPlate titleW={160}>
      <Bone w={96} h={48} inPlate />
      <Box mt={2}><Bone w="100%" h={8} inPlate /></Box>
      <Box mt={1}><SkelRow inPlate /><SkelRow inPlate /><SkelRow inPlate /></Box>
      <Box mt={2}><Bone w={120} h={24} inPlate /><Box mt={1}><Bone w="55%" h={16} inPlate /></Box></Box>
    </SkelPlate>
  );
  const nearby = (
    <SkelPlate titleW={110}>
      <Stack direction="row" alignItems="flex-end" gap={2}>
        <Bone w={72} h={32} inPlate />
        <Bone w="50%" h={16} inPlate />
      </Stack>
      <Box mt={2.5}><Bone w="100%" h={44} inPlate /></Box>
    </SkelPlate>
  );
  const questions = <SkelPlate titleW={130}><SkelRow inPlate /></SkelPlate>;
  const news = <SkelPlate titleW={90}><SkelRow inPlate /></SkelPlate>;
  return (
    <Box aria-busy aria-label="Загрузка" role="status">
      <SkelHead titleW={360} />
      {desktop ? (
        <Box sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 5,
          alignItems: "start",
        }}>
          <Stack gap={5} sx={{ minWidth: 0, alignSelf: "start" }}>
            {today}
            {progress}
          </Stack>
          <Stack gap={5} sx={{ minWidth: 0, alignSelf: "start" }}>
            {nearby}
            {questions}
            {news}
          </Stack>
        </Box>
      ) : (
        <Stack gap={2}>
          {today}
          {nearby}
          {questions}
          {news}
          {progress}
        </Stack>
      )}
    </Box>
  );
};

/** Скелетон списка/плашек — план, вопросы, заявки, команда. */
export const ListSkeleton = ({ plates = 2, rows = 3 }: { plates?: number; rows?: number }) => (
  <Box aria-busy aria-label="Загрузка" role="status">
    <SkelHead />
    <Stack gap={{ xs: 2, md: 5 }}>
      {Array.from({ length: plates }, (_, i) => (
        <SkelPlate key={i} titleW={120 + i * 20}>
          {Array.from({ length: rows }, (_, j) => <SkelRow key={j} inPlate />)}
        </SkelPlate>
      ))}
    </Stack>
  </Box>
);

/** Скелетон базы знаний: поиск, чипы, сетка карточек. */
export const KnowledgeSkeleton = () => {
  const { t } = useTheme();
  return (
    <Box aria-busy aria-label="Загрузка" role="status">
      <SkelHead titleW={220} />
      <Bone w="100%" h={48} />
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ my: 3 }}>
        {[64, 160, 140, 150, 130, 100].map((w) => <Bone key={w} w={w} h={36} />)}
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} sx={{ bgcolor: t.surface, p: 2.5, minHeight: 180, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Bone w={100} h={22} inPlate />
            <Bone w="85%" h={20} inPlate />
            <Bone w="100%" h={12} inPlate />
            <Bone w="90%" h={12} inPlate />
            <Box mt="auto" pt={1}><Bone w="50%" h={12} inPlate /></Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};


