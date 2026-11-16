// Подключение Telegram (BR-50): одноразовый код из веба → боту. В Telegram приходит только факт события
// и ссылка сюда — без текстов вопросов и ответов (BR-51), и только в рабочие часы (BR-52).
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, Link, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { api } from "@/shared/api";
import { brand } from "@/shared/theme";
import { DialogBack, DialogClose } from "@/shared/ui";

type Status = { connected: boolean; mode: string; bot?: string };
type Code = { code: string; link: string; bot: string; mode: string };

export const TelegramDialog = ({ open, login, onClose, onBack, onChange }: {
  open: boolean; login: string; onClose: () => void;
  /** На мобилке: вернуться на экран аккаунта вместо крестика. */
  onBack?: () => void;
  onChange: (msg: string) => void;
}) => {
  const theme = useTheme();
  const { t, space, type, size, stroke } = theme;
  /** Как «Аккаунт» / профиль — fullScreen ниже md. */
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setCode(null); setError(""); return; }
    let alive = true;
    const check = () => api<{ telegram: Status }>(login, "/api/notifications").then((r) => { if (alive) setStatus(r.telegram); }).catch(() => undefined);
    void check();
    const timer = setInterval(check, 3000); // пока окно открыто — ждём, когда бот подтвердит код
    return () => { alive = false; clearInterval(timer); };
  }, [open, login]);

  const getCode = async () => {
    setError("");
    try { setCode(await api<Code>(login, "/api/telegram/link", { method: "POST", body: "{}" })); }
    catch (e) { setError(e instanceof Error ? e.message : "Не получилось"); }
  };
  const unlink = async () => {
    await api(login, "/api/telegram/link", { method: "DELETE" }).catch(() => undefined);
    setStatus((s) => (s ? { ...s, connected: false } : s));
    onChange("Telegram отключён");
  };

  const textBtn = {
    minHeight: size.controlSm,
    px: `${space[3]}px`,
    bgcolor: t.bg,
    "&:hover": { bgcolor: t.surfaceHover },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={mobile}
      aria-labelledby="telegram-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 0,
            border: mobile ? "none" : `${stroke.thick}px solid ${t.line}`,
            boxShadow: "none",
            display: "flex",
            flexDirection: "column",
            ...(mobile && { bgcolor: t.bg }),
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
            id="telegram-title"
            component="h2"
            fontWeight={type.weight.semibold}
            fontSize={type.size.h2}
            lineHeight={type.line.snug}
            sx={{ minWidth: 0 }}
          >
            Уведомления в Telegram
          </Typography>
        </Stack>
        {!onBack && <DialogClose onClose={onClose} />}
      </Stack>
      <DialogContent sx={{
        px: `${space[5]}px`,
        pb: `${space[4]}px`,
        flex: "1 1 auto",
        minHeight: 0,
      }}>
        <Stack gap={`${space[4]}px`}>
          <Typography color="text.secondary">
            Бот пришлёт, что ответили на вопрос, изменился статус заявки или скоро встреча — и ссылку сюда. Тексты вопросов и ответов остаются в Напарнике.
          </Typography>

          {status?.connected ? (
            <Stack direction="row" alignItems="flex-start" gap={`${space[2]}px`} sx={{ p: `${space[4]}px`, bgcolor: t.okSoft }}>
              <Box aria-hidden sx={{ width: 8, height: 8, mt: "7px", flex: "none", bgcolor: brand.green }} />
              <Box>
                <Typography fontWeight={type.weight.semibold}>Telegram подключён</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: `${space[1]}px` }}>
                  Уведомления приходят в рабочие часы, срочные — сразу.
                </Typography>
              </Box>
            </Stack>
          ) : code ? (
            <Stack gap={`${space[3]}px`}>
              <Typography variant="body2" color="text.secondary">Отправь боту этот код — он действует 10 минут:</Typography>
              <Box sx={{
                bgcolor: t.bg,
                p: `${space[4]}px`,
                textAlign: "center",
                fontSize: type.size.h2,
                fontWeight: type.weight.semibold,
                letterSpacing: "0.08em",
                fontFamily: "ui-monospace, monospace",
              }}>
                {code.code}
              </Box>
              {code.link
                ? <Button variant="contained" component={Link} href={code.link} target="_blank" rel="noopener" sx={{ minHeight: size.control, alignSelf: "stretch" }}>
                    Открыть @{code.bot}
                  </Button>
                : <Typography variant="body2" color="text.secondary">Бот на сервере в режиме журнала (нет TG_BOT_TOKEN) — сообщения пишутся в лог.</Typography>}
              <Typography variant="caption" color="text.secondary">Жду подтверждения от бота…</Typography>
            </Stack>
          ) : (
            <Button
              variant="contained"
              onClick={() => void getCode()}
              disabled={status?.mode === "off"}
              sx={{ minHeight: size.control, alignSelf: "flex-start" }}
            >
              Получить код
            </Button>
          )}

          {status?.mode === "off" && (
            <Typography variant="body2" color="text.secondary">Telegram на сервере не настроен.</Typography>
          )}
          {error && <Typography color="error.main" role="alert">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{
        px: `${space[4]}px`,
        py: `${space[4]}px`,
        gap: `${space[2]}px`,
        flex: "none",
        ...(mobile && { pb: `max(${space[4]}px, env(safe-area-inset-bottom))` }),
      }}>
        {status?.connected && (
          <Button variant="text" onClick={() => void unlink()} sx={textBtn}>Отключить</Button>
        )}
        <Button
          variant={status?.connected ? "contained" : "text"}
          onClick={onClose}
          sx={status?.connected ? { minHeight: size.control } : textBtn}
        >
          Готово
        </Button>
      </DialogActions>
    </Dialog>
  );
};
