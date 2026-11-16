// Настройки (SCR-I8): режим подсказок, видимость вопросов для бадди, напоминания, «не беспокоить».
// Каждое изменение сохраняется сразу; рабочие часы — из оргструктуры, только показываются.
import { useEffect, useState, type ReactNode } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, Stack, Switch, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import { api, type Settings } from "@/shared/api";
import { brand } from "@/shared/theme";
import { DialogBack, DialogClose } from "@/shared/ui";

const MODES: Array<[Settings["proactivity"], string, string]> = [
  ["daily_plan", "План на день", "Утром — шаги на сегодня, плюс напоминания о встречах и дедлайнах"],
  ["deadlines_and_meetings", "Только дедлайны и встречи", "Без утреннего плана"],
  ["off", "Выключено", "Напарник пишет, только когда спросишь"],
];
const QUIET: Array<[number, string]> = [[1, "На час"], [3, "На 3 часа"], [8, "До конца дня"]];
const REMINDERS: Array<[string, string]> = [["1d", "За день"], ["1h", "За час"]];

const Section = ({ title, hint, dot, children }: { title: string; hint?: string; dot: string; children: ReactNode }) => {
  const { space, type } = useTheme();
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" alignItems="center" gap={`${space[2]}px`} sx={{ mb: hint ? `${space[1]}px` : `${space[3]}px` }}>
        <Box aria-hidden sx={{ width: 8, height: 8, flex: "none", bgcolor: dot }} />
        <Typography fontWeight={type.weight.semibold}>{title}</Typography>
      </Stack>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mb: `${space[3]}px` }}>{hint}</Typography>}
      {children}
    </Box>
  );
};

export const SettingsDialog = ({ open, login, intern, onClose, onBack, onTelegram }: {
  open: boolean; login: string; intern: boolean; onClose: () => void;
  /** На мобилке: вернуться на экран аккаунта вместо крестика. */
  onBack?: () => void;
  onTelegram: () => void;
}) => {
  const theme = useTheme();
  const { t, space, type, size, stroke } = theme;
  /** Как экран «Аккаунт» в App — fullScreen ниже md. */
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [s, setS] = useState<Settings | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setS(null); setStatus(""); setError("");
    api<{ settings: Settings }>(login, "/api/settings", { signal: c.signal })
      .then((r) => setS(r.settings))
      .catch((e) => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить настройки"); });
    return () => c.abort();
  }, [open, login]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setError(""); setStatus("");
    try {
      const r = await api<{ settings: Settings }>(login, "/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setS(r.settings); setStatus("Сохранено");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить"); }
    finally { setBusy(false); }
  };
  const toggleReminder = (code: string, on: boolean) => {
    if (!s) return;
    void save({ reminders: on ? [...new Set([...s.reminders, code])] : s.reminders.filter((x) => x !== code) });
  };
  const quietTill = s?.quiet_until ? new Date(s.quiet_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";

  const choiceSx = (active: boolean) => ({
    all: "unset" as const,
    boxSizing: "border-box" as const,
    display: "block",
    width: "100%",
    cursor: busy ? "default" : "pointer",
    textAlign: "left" as const,
    p: `${space[3]}px`,
    bgcolor: active ? t.inverse : t.bg,
    color: active ? t.onInverse : t.text,
    border: "none",
    "&:hover": busy ? undefined : { bgcolor: active ? t.inverseHover : t.surfaceHover },
    "&:focus-visible": { outline: `${stroke.thick}px solid ${t.link}`, outlineOffset: 2 },
  });

  const chipSx = (active: boolean) => ({
    font: "inherit",
    fontSize: type.size.md,
    fontWeight: type.weight.semibold,
    border: "none",
    cursor: busy ? "default" : "pointer",
    minHeight: size.controlSm,
    px: `${space[3]}px`,
    py: `${space[2]}px`,
    bgcolor: active ? t.inverse : t.surface,
    color: active ? t.onInverse : t.text,
    "&:hover": busy ? undefined : { bgcolor: active ? t.inverseHover : t.surfaceHover },
    "&:focus-visible": { outline: `${stroke.thick}px solid ${t.link}` },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={mobile}
      aria-labelledby="settings-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 0,
            border: mobile ? "none" : `${stroke.thick}px solid ${t.line}`,
            boxShadow: "none",
            display: "flex",
            flexDirection: "column",
            ...(!mobile && { height: size.dialog, maxHeight: size.dialog }),
          },
        },
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={1}
        sx={{
          pl: onBack ? `${space[4]}px` : `${space[5]}px`,
          pr: `${space[4]}px`,
          pt: `${space[5]}px`,
          pb: `${space[3]}px`,
          flex: "none",
          ...(mobile && { position: "sticky", top: 0, zIndex: 1, bgcolor: t.bg, borderBottom: `1px solid ${t.line}` }),
        }}
      >
        <Stack direction="row" alignItems="center" gap={1} minWidth={0} flex={1}>
          {onBack && <DialogBack onBack={onBack} label="Назад к аккаунту" />}
          <Typography
            id="settings-title"
            component="h2"
            fontWeight={type.weight.semibold}
            fontSize={type.size.h2}
            lineHeight={type.line.snug}
            sx={{ minWidth: 0 }}
          >
            Настройки
          </Typography>
        </Stack>
        {!onBack && <DialogClose onClose={onClose} />}
      </Stack>
      <DialogContent sx={{
        px: `${space[5]}px`,
        pb: 0,
        flex: "1 1 auto",
        minHeight: 0,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}>
        {!s && !error && <Typography color="text.secondary">Загружаю…</Typography>}
        {s && (
          <Stack gap={`${space[6]}px`} sx={{ pb: `${space[4]}px` }}>
            {intern && (
              <Section title="Как Напарник подсказывает" dot={brand.violet}>
                <Stack gap={`${space[2]}px`} role="radiogroup" aria-label="Как Напарник подсказывает">
                  {MODES.map(([value, label, hint]) => {
                    const active = s.proactivity === value;
                    return (
                      <Box
                        key={value}
                        component="button"
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={busy}
                        onClick={() => { if (!active) void save({ proactivity: value }); }}
                        sx={choiceSx(active)}
                      >
                        <Typography fontWeight={type.weight.semibold} sx={{ color: "inherit" }}>{label}</Typography>
                        <Typography variant="body2" sx={{ mt: `${space[1]}px`, color: active ? "inherit" : "text.secondary", opacity: active ? 0.8 : 1 }}>
                          {hint}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Section>
            )}

            {intern && (
              <Section
                title="Что видит бадди"
                dot={brand.green}
                hint="Если выключить, бадди увидит только адресата и статус — без текста вопроса и ответа."
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={`${space[3]}px`}
                  sx={{ p: `${space[3]}px`, bgcolor: t.bg }}
                >
                  <Typography sx={{ flex: 1 }}>Показывать бадди текст моих вопросов экспертам</Typography>
                  <Switch
                    checked={s.question_text_visible_to_buddy}
                    disabled={busy}
                    onChange={(e) => void save({ question_text_visible_to_buddy: e.target.checked })}
                    inputProps={{ "aria-label": "Показывать бадди текст моих вопросов экспертам" }}
                  />
                </Stack>
              </Section>
            )}

            <Section title="Напоминания о встречах и событиях" dot={brand.blue}>
              <Stack direction="row" gap={`${space[2]}px`} flexWrap="wrap">
                {REMINDERS.map(([code, label]) => {
                  const active = s.reminders.includes(code);
                  return (
                    <Box
                      key={code}
                      component="button"
                      type="button"
                      role="checkbox"
                      disabled={busy}
                      aria-checked={active}
                      onClick={() => toggleReminder(code, !active)}
                      sx={chipSx(active)}
                    >
                      {label}
                    </Box>
                  );
                })}
              </Stack>
            </Section>

            <Section
              title="Не беспокоить"
              dot={brand.amber}
              hint={s.quiet_until ? undefined : "Несрочные уведомления в Telegram подождут, срочные придут сразу."}
            >
              {s.quiet_until ? (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  alignItems={{ sm: "center" }}
                  justifyContent="space-between"
                  gap={`${space[3]}px`}
                  sx={{ p: `${space[4]}px`, bgcolor: t.waitSoft }}
                >
                  <Stack direction="row" alignItems="flex-start" gap={`${space[2]}px`}>
                    <Box aria-hidden sx={{ width: 8, height: 8, mt: "7px", flex: "none", bgcolor: brand.blue }} />
                    <Box>
                      <Typography fontWeight={type.weight.semibold}>Включено до {quietTill}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: `${space[1]}px` }}>
                        Срочное всё равно придёт.
                      </Typography>
                    </Box>
                  </Stack>
                  <Button
                    variant="text"
                    size="small"
                    disabled={busy}
                    onClick={() => void save({ quiet_hours: 0 })}
                    sx={{ minHeight: size.controlSm, px: `${space[3]}px`, bgcolor: t.bg, "&:hover": { bgcolor: t.surfaceHover } }}
                  >
                    Выключить
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" gap={`${space[2]}px`} flexWrap="wrap">
                  {QUIET.map(([h, label]) => (
                    <Box
                      key={h}
                      component="button"
                      type="button"
                      disabled={busy}
                      onClick={() => void save({ quiet_hours: h })}
                      sx={chipSx(false)}
                    >
                      {label}
                    </Box>
                  ))}
                </Stack>
              )}
            </Section>

            <Section title="Рабочие часы" dot={brand.blue} hint="Из оргструктуры: в это время приходят уведомления и подбираются слоты встреч.">
              <Box sx={{ p: `${space[3]}px`, bgcolor: t.bg }}>
                <Typography fontWeight={type.weight.medium}>{s.working_hours || "не указаны"}</Typography>
              </Box>
            </Section>

            <Section title="Telegram" dot={brand.violet}>
              <Box
                component="button"
                type="button"
                onClick={onTelegram}
                sx={chipSx(false)}
              >
                Подключить или отключить бота
              </Box>
            </Section>
          </Stack>
        )}
        {error && <Typography color="error.main" role="alert" mt={`${space[4]}px`}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: `${space[4]}px`, py: `${space[4]}px`, gap: `${space[2]}px`, justifyContent: "space-between", flex: "none" }}>
        <Typography variant="body2" color="text.secondary" role="status">{status}</Typography>
        <Button variant="contained" onClick={onClose} sx={{ minHeight: size.control }}>Готово</Button>
      </DialogActions>
    </Dialog>
  );
};
