// Чат с Напарником: Markdown без HTML-вставок, читаемые черновики с «Подтвердить / Отмена»,
// квитанция после подтверждения, «Повторить» при сбое (BR-11, BR-14, BR-43, BR-70, SC-05, SC-15).
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, Checkbox, CircularProgress, Drawer, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { AddCommentOutlined, CloseRounded, SendRounded } from "@mui/icons-material";
import { Mascot3D, useMascotMood } from "@/widgets/mascot";
import { AiTag } from "@/shared/ui";
import { ApiError, api, type ChatReply } from "@/shared/api";

export type ChatMessage = { role: "user" | "assistant"; text: string; reply?: ChatReply; retryText?: string };
export type Draft = ChatReply["drafts"][number];
export type Lookup = { userName: (id: string) => string; systemTitle: (id: string) => string; stepTitle: (id: string) => string };

// ---------- Markdown: жирный, код, списки, цитаты — только React-узлы ----------

const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`")) return <Box key={i} component="code" sx={{ px: 0.5, bgcolor: "action.hover", fontSize: 13 }}>{part.slice(1, -1)}</Box>;
    return <Fragment key={i}>{part}</Fragment>;
  });

export const Markdown = ({ text }: { text: string }) => {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Box key={blocks.length} component={Tag} sx={{ my: 0.5, pl: 2.5 }}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Box>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      const ordered = /\d/.test(item[1]);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(item[2]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const quote = line.match(/^>\s?(.*)$/);
    const body = inline(quote ? quote[1] : line.replace(/^#{1,6}\s+/, ""));
    blocks.push(quote
      ? <Box key={blocks.length} sx={{ borderLeft: 3, borderColor: "divider", pl: 1.5, my: 0.5 }}>{body}</Box>
      : <Typography key={blocks.length} sx={{ my: 0.5 }}>{body}</Typography>);
  }
  flush();
  return <>{blocks}</>;
};

// ---------- черновик действия ----------

const ABSENCE: Record<string, string> = { day_off: "Отгул", vacation: "Отпуск", sick_leave: "Больничный" };
const STATUS_RU: Record<string, string> = { pending: "на согласовании", approved: "согласовано", granted: "выдан", rejected: "отклонено", Sent: "отправлен", Done: "готово" };
const ruDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) : iso);

// BR-14: человек видит, что именно уйдёт, а не имя инструмента.
export const describeDraft = (d: Draft, look: Lookup): { title: string; rows: Array<[string, string]>; text?: string } => {
  const a = d.args as Record<string, string | boolean | undefined>;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  switch (d.tool) {
    case "create_absence_request":
      return { title: `${ABSENCE[s("type")] ?? "Отсутствие"}: заявка в сервис отсутствий`, rows: [["Дата", ruDate(s("date"))], ["Комментарий", s("comment")]] };
    case "request_access":
      return { title: "Заявка на доступ", rows: [["Система", look.systemTitle(s("system"))], ["Зачем", s("reason")]] };
    case "send_question":
      return { title: `Вопрос: ${look.userName(s("addressee_id"))}`, rows: [["Почему", s("reason")], ["Срочность", a.urgent ? "срочно — сразу" : "обычный — в сводке"]], text: s("text") };
    case "mark_step_done":
      return { title: "Отметить шаг выполненным", rows: [["Шаг", look.stepTitle(s("step_id"))]] };
    default:
      return { title: "Действие", rows: [] };
  }
};

// Черновик действия. Состояние подтверждает сервер: правки, подтверждение и отмена переживают перезагрузку
// и другую вкладку (BR-14, SC-05). Из истории уже подтверждённый или отменённый черновик показывается сразу,
// без запроса; ожидающий — перечитывается с сервера, чтобы показать актуальный текст и версию.
const receiptNote = (r: Record<string, string> = {}) =>
  `Готово: ${[r.id, STATUS_RU[r.status] ?? r.status, r.approver, r.to && `${r.to}, ${r.delivery}`].filter(Boolean).join(" · ")}`;

export const DraftCard = ({ draft, login, look, onDone }: { draft: Draft; login: string; look: Lookup; onDone: (draft?: Draft) => void }) => {
  const { t } = useTheme();
  const settled = draft.status === "confirmed" || draft.status === "cancelled";
  const [current, setCurrent] = useState(draft);
  const [ready, setReady] = useState(settled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const sync = async (signal: AbortSignal) => {
    const r = await api<{ draft: Draft }>(login, `/api/drafts/${draft.id}`, { signal });
    if (!signal.aborted) { setCurrent(r.draft); setReady(true); }
    return r.draft;
  };
  useEffect(() => {
    const c = new AbortController(); controller.current = c;
    if (!settled) {
      setReady(false); setEditing(false); setError("");
      void sync(c.signal).catch((e) => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Не получилось загрузить черновик"); });
    }
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login, draft.id]);
  const run = async (method: "PATCH" | "POST" | "DELETE", body: unknown) => {
    const signal = controller.current?.signal;
    if (busy || !ready || !signal || signal.aborted) return;
    setBusy(true); setError(""); setRetry(false);
    try {
      await api(login, `/api/drafts/${draft.id}${method === "POST" ? "/confirm" : ""}`, { method, body: JSON.stringify(body), signal });
      const saved = await sync(signal);
      if (signal.aborted) return;
      setEditing(false); onDone(saved);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "Не получилось выполнить действие");
      setRetry(e instanceof ApiError && e.status === 503); // сервис недоступен — черновик сохранён, можно повторить
      // Запрос мог выполниться, даже если ответ потерян: перечитываем состояние с сервера.
      try {
        const saved = await sync(signal);
        if (!signal.aborted && saved.status !== "pending") { setEditing(false); onDone(saved); }
      } catch { /* кнопка «Обновить черновик» ниже */ setReady(false); }
    } finally { if (!signal.aborted) setBusy(false); }
  };
  const view = describeDraft(current, look);
  const version = current.version ?? 1;
  if (ready && current.status === "confirmed") return <Box sx={{ p: 1.5, mt: 1, bgcolor: t.okSoft }}><Typography fontWeight={600}>✓ {receiptNote(current.result?.receipt)}</Typography></Box>;
  if (ready && current.status === "cancelled") return <Box sx={{ p: 1.5, mt: 1, border: `2px solid ${t.line}` }}><Typography color="text.secondary">Отменено — ничего не отправлено.</Typography></Box>;
  return (
    <Box sx={{ p: 1.5, mt: 1, bgcolor: t.aiSoft }}>
      <Typography variant="caption" sx={{ color: t.ai, fontWeight: 700 }}>Черновик — проверь перед отправкой</Typography>
      <Typography fontWeight={600} mt={0.5}>{view.title}</Typography>
      {view.rows.filter(([, v]) => v).map(([k, v]) => <Typography key={k} variant="body2"><Box component="span" color="text.secondary">{k}: </Box>{v}</Typography>)}
      {editing ? <Stack gap={1} mt={1.5}>
        <TextField label="Текст вопроса" value={text} onChange={(e) => setText(e.target.value)} fullWidth multiline minRows={3} disabled={busy}
          sx={{ "& .MuiInputBase-root": { bgcolor: t.bg }, "& .MuiFormHelperText-root": { mx: 0 } }}
          slotProps={{ htmlInput: { maxLength: 8000 } }} helperText="Исправь формулировку перед отправкой. Не добавляй паспортные или банковские данные." />
        <FormControlLabel control={<Checkbox checked={urgent} disabled={busy} onChange={(e) => setUrgent(e.target.checked)} />} label="Срочно — без ответа не могу продолжить работу" />
        <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
          <Button variant="contained" disabled={busy || !text.trim()} onClick={() => void run("PATCH", { version, text, urgent })}>Сохранить изменения</Button>
          <Button variant="text" disabled={busy} onClick={() => setEditing(false)}>Не сохранять</Button>
        </Stack>
      </Stack> : view.text && <Box sx={{ p: 1.25, mt: 1, bgcolor: t.bg }}><Markdown text={view.text} /></Box>}
      {error && <Typography variant="body2" color="error.main" mt={1} role="alert">{error}{retry ? " Черновик сохранён." : ""}</Typography>}
      {!ready && error && <Button variant="text" onClick={() => { const signal = controller.current?.signal; if (signal) { setError(""); void sync(signal).catch((e) => { if (!signal.aborted) setError(e instanceof Error ? e.message : "Не получилось"); }); } }}>Обновить черновик</Button>}
      {current.tool === "send_question" && !editing && <Button variant="text" disabled={!ready || busy} onClick={() => { setText(String(current.args.text ?? "")); setUrgent(Boolean(current.args.urgent)); setEditing(true); }}>Изменить вопрос</Button>}
      <Stack direction="row" spacing={1} mt={1.5}>
        <Button variant="contained" fullWidth disabled={!ready || busy || editing} onClick={() => void run("POST", { version })}>
          {busy ? "Выполняю…" : retry ? "Повторить" : "Подтвердить"}
        </Button>
        <Button variant="outlined" fullWidth disabled={!ready || busy} onClick={() => void run("DELETE", { version })}>Отмена</Button>
      </Stack>
    </Box>
  );
};

// ---------- окно чата ----------

/** Отметка полезности ответа из базы (SCR-I2). «Не помогло» сразу ведёт к человеку. */
const Feedback = ({ onNotHelpful, onRate }: { onNotHelpful: () => void; onRate: (value: string) => void }) => {
  const [picked, setPicked] = useState("");
  const options: Array<[string, string]> = [["helped", "Помогло"], ["not", "Не помогло"], ["stale", "Устарело"]];
  const thanks: Record<string, string> = { helped: "Спасибо, учту", not: "Ищу, кто поможет…", stale: "Спасибо, передам владельцу базы" };
  if (picked) return <Typography variant="body2" color="text.secondary" sx={{ display: "block", mt: 1 }}>{thanks[picked]}</Typography>;
  return <Stack direction="row" gap={1} mt={1} flexWrap="wrap">
    {options.map(([id, label]) => (
      <Button key={id} variant="text" size="small" sx={{ minHeight: 36, px: 1.5 }}
        onClick={() => { setPicked(id); onRate(id === "not" ? "not_helped" : id); if (id === "not") onNotHelpful(); }}>{label}</Button>
    ))}
  </Stack>;
};

type SoftKey = "todaySoft" | "aiSoft" | "okSoft" | "waitSoft";
const QUICK: Array<{ text: string; soft: SoftKey }> = [
  { text: "Что мне сегодня делать?", soft: "todaySoft" },
  { text: "Что такое витрина?", soft: "aiSoft" },
  { text: "Нужен отгул в пятницу", soft: "okSoft" },
  { text: "Нужен доступ к Redash", soft: "waitSoft" },
];

/** Маскот в шапке чата: следит за курсором, думает, пока идёт ответ, растерян при сбое. */
const ChatMascot = ({ loading, failed }: { loading: boolean; failed: boolean }) => {
  const { mood } = useMascotMood({ thinking: loading, error: failed });
  return <Mascot3D size={48} mood={mood} />;
};

/** На компьютере — панель справа, на телефоне — на весь экран. */
export const ChatDrawer = ({ open, onClose, text, setText, messages, loading, onSend, login, look, onAction, onReset }: {
  open: boolean; onClose: () => void; text: string; setText: (text: string) => void; messages: ChatMessage[]; loading: boolean;
  onSend: (text?: string) => void; login: string; look: Lookup; onAction: () => void;
  /** «Новый разговор»: окно пустеет, вопросы остаются в «Моих вопросах». */
  onReset?: () => void;
}) => {
  const theme = useTheme();
  const { t } = theme;
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const list = useRef<HTMLDivElement>(null);
  // Скролл только внутри ленты — scrollIntoView на мобилке дёргает весь экран и выглядит «багнуто».
  useEffect(() => {
    if (!open) return;
    const el = list.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);
  return (
    <Drawer anchor={mobile ? "bottom" : "right"} open={open} onClose={onClose}
      slotProps={{
        paper: {
          sx: mobile
            ? {
                width: "100%", height: "100%", maxHeight: "100dvh",
                borderRadius: 0, border: 0,
                display: "flex", flexDirection: "column",
                pt: "env(safe-area-inset-top)",
                pb: "env(safe-area-inset-bottom)",
                overflow: "hidden",
              }
            : { width: 440, borderLeft: `1px solid ${t.line}`, display: "flex", flexDirection: "column", overflow: "hidden" },
        },
      }}>
      <Stack sx={{ bgcolor: t.bg, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${t.line}`, flex: "none" }}>
          <ChatMascot loading={loading} failed={Boolean(messages.length && messages[messages.length - 1].retryText && !messages[messages.length - 1].reply)} />
          <Box flex={1} minWidth={0}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography fontWeight={600} fontSize={17}>Напарник</Typography>
              <AiTag>ИИ</AiTag>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {loading ? "Думаю…" : "Без подтверждения ничего не отправит"}
            </Typography>
          </Box>
          {onReset && messages.length > 1 && <Tooltip title="Новый разговор">
            <IconButton onClick={onReset} disabled={loading} aria-label="Новый разговор"><AddCommentOutlined /></IconButton>
          </Tooltip>}
          <IconButton onClick={onClose} aria-label="Закрыть чат"><CloseRounded /></IconButton>
        </Stack>
        <Stack ref={list} gap={2} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          {messages.map((m, index) => {
            const intro = m.role === "assistant" && index === 0 && messages.length === 1;
            return (
              <Box key={`${m.role}-${index}`} alignSelf={m.role === "user" ? "flex-end" : "stretch"}
                sx={{ maxWidth: m.role === "user" ? "92%" : "100%", width: m.role === "assistant" ? "100%" : undefined }}>
                <Box sx={{ px: 2, py: 1.5, bgcolor: m.role === "user" ? t.inverse : t.surface, color: m.role === "user" ? t.onInverse : t.text }}>
                  {m.reply?.degraded && <Typography variant="caption" sx={{ display: "block", color: t.muted, fontWeight: 600, mb: 0.5 }}>Упрощённый режим · без модели</Typography>}
                  {m.role === "user" ? <Typography>{m.text}</Typography> : <Markdown text={m.text} />}
                </Box>
                {m.reply?.sources.map((s) => (
                  <Box key={s.page_id} sx={{ px: 1.5, py: 1.25, mt: 1, bgcolor: t.surface }}>
                    <Typography variant="body2" fontWeight={600}>{s.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{s.author} · {s.updated_at}{s.label ? ` · ${s.label}` : ""}</Typography>
                  </Box>
                ))}
                {m.reply?.drafts.map((d) => <DraftCard key={d.id} draft={d} login={login} look={look} onDone={onAction} />)}
                {m.reply && m.reply.sources.length > 0 && !m.reply.drafts.length && <Feedback onNotHelpful={() => onSend(`Не помогло, нужен человек: ${messages[index - 1]?.text ?? ""}`)}
                  onRate={(value) => { void api(login, "/api/feedback", { method: "POST", body: JSON.stringify({ page_id: m.reply?.sources[0]?.page_id, value }) }).catch(() => undefined); }} />}
                {m.reply?.actions && m.reply.actions.length > 0 && index === messages.length - 1 && !loading && (
                  <Stack direction="row" gap={1} mt={1} flexWrap="wrap" aria-label="Быстрые действия">
                    {m.reply.actions.map((x) => (
                      <Button key={x.label} variant="outlined" size="small" sx={{ minHeight: 36 }} onClick={() => onSend(x.text)}>{x.label}</Button>
                    ))}
                  </Stack>
                )}
                {m.retryText && <Button variant="text" size="small" sx={{ mt: 1, minHeight: 36 }} onClick={() => onSend(m.retryText)}>Повторить</Button>}
                {intro && !loading && (
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 2 }}>
                    {QUICK.map((q) => (
                      <Button key={q.text} variant="text" onClick={() => onSend(q.text)}
                        sx={{
                          minHeight: 64, px: 1.5, py: 1.5, justifyContent: "flex-start", alignItems: "flex-start", textAlign: "left",
                          bgcolor: t[q.soft], fontWeight: 600, lineHeight: 1.35, whiteSpace: "normal",
                          "&:hover": { bgcolor: t[q.soft], filter: "brightness(0.97)" },
                        }}>
                        {q.text}
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
          {loading && <Stack direction="row" gap={1} alignItems="center"><CircularProgress size={18} sx={{ color: t.ai }} /><Typography color="text.secondary">Думаю…</Typography></Stack>}
        </Stack>
        <Stack direction="row" gap={1} sx={{ p: 1.5, borderTop: `1px solid ${t.line}`, flex: "none" }}>
          {/* На мобилке без autoFocus — иначе сразу вылезает клавиатура. */}
          <TextField autoFocus={!mobile} fullWidth multiline maxRows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Спроси о команде или задачах"
            aria-label="Сообщение Напарнику" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            sx={{
              // В чате чёрный фокус слишком жёсткий — мягкий контур цвета ИИ, поле остаётся заметным
              "& .MuiOutlinedInput-root.Mui-focused": { outline: `2px solid ${t.ai}`, outlineOffset: 0 },
            }} />
          <IconButton onClick={() => onSend()} disabled={!text.trim() || loading} aria-label="Отправить"
            sx={{
              width: 48, height: 48, borderRadius: 0, bgcolor: t.inverse, color: t.onInverse, alignSelf: "flex-end",
              "&:hover": { bgcolor: t.inverseHover },
              "&.Mui-disabled": { bgcolor: t.line, color: t.muted },
            }}>
            <SendRounded />
          </IconButton>
        </Stack>
      </Stack>
    </Drawer>
  );
};
