// Чат с Напарником: Markdown без HTML-вставок, читаемые черновики с «Подтвердить / Отмена»,
// квитанция после подтверждения, «Повторить» при сбое (BR-11, BR-14, BR-43, BR-70, SC-05, SC-15).
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, CircularProgress, Drawer, IconButton, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { CloseRounded, SendRounded } from "@mui/icons-material";
import { MascotBadge } from "@/shared/ui/Mascot";
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

type DraftState = { status: "new" | "busy" | "done" | "cancelled" | "error"; note?: string; retry?: boolean };

const DraftCard = ({ draft, login, look, onDone }: { draft: Draft; login: string; look: Lookup; onDone: () => void }) => {
  const { t } = useTheme();
  const [st, setSt] = useState<DraftState>({ status: "new" });
  const view = describeDraft(draft, look);
  const confirm = async () => {
    setSt({ status: "busy" });
    try {
      const res = await api<{ receipt?: Record<string, string> }>(login, `/api/drafts/${draft.id}/confirm`, { method: "POST", body: "{}" });
      const r = res.receipt ?? {};
      const parts = [r.id, STATUS_RU[r.status] ?? r.status, r.approver, r.to && `${r.to}, ${r.delivery}`].filter(Boolean);
      setSt({ status: "done", note: `Готово: ${parts.join(" · ")}` });
      onDone();
    } catch (e) {
      const unavailable = e instanceof ApiError && e.status === 503;
      setSt({ status: "error", note: e instanceof Error ? e.message : "Не получилось", retry: unavailable });
    }
  };
  if (st.status === "done") return <Box sx={{ p: 1.5, mt: 1, bgcolor: t.okSoft }}><Typography fontWeight={600}>✓ {st.note}</Typography></Box>;
  if (st.status === "cancelled") return <Box sx={{ p: 1.5, mt: 1, border: `2px solid ${t.line}` }}><Typography color="text.secondary">Отменено — ничего не отправлено.</Typography></Box>;
  return (
    <Box sx={{ p: 1.5, mt: 1, bgcolor: t.aiSoft }}>
      <Typography variant="caption" sx={{ color: t.ai, fontWeight: 700 }}>Черновик — проверь перед отправкой</Typography>
      <Typography fontWeight={600} mt={0.5}>{view.title}</Typography>
      {view.rows.filter(([, v]) => v).map(([k, v]) => <Typography key={k} variant="body2"><Box component="span" color="text.secondary">{k}: </Box>{v}</Typography>)}
      {view.text && <Box sx={{ p: 1.25, mt: 1, bgcolor: t.bg }}><Markdown text={view.text} /></Box>}
      {st.status === "error" && <Typography variant="body2" color="error.main" mt={1} role="alert">{st.note}{st.retry ? " Черновик сохранён." : ""}</Typography>}
      <Stack direction="row" spacing={1} mt={1.5}>
        <Button variant="contained" fullWidth disabled={st.status === "busy" || (st.status === "error" && !st.retry)} onClick={() => void confirm()}>
          {st.status === "busy" ? "Отправляю…" : st.status === "error" && st.retry ? "Повторить" : "Подтвердить"}
        </Button>
        <Button variant="outlined" fullWidth disabled={st.status === "busy"} onClick={() => setSt({ status: "cancelled" })}>Отмена</Button>
      </Stack>
    </Box>
  );
};

// ---------- окно чата ----------

/** Отметка полезности ответа из базы (SCR-I2). «Не помогло» сразу ведёт к человеку. */
const Feedback = ({ onNotHelpful }: { onNotHelpful: () => void }) => {
  const [picked, setPicked] = useState("");
  const options: Array<[string, string]> = [["helped", "Помогло"], ["not", "Не помогло"], ["stale", "Устарело"]];
  const thanks: Record<string, string> = { helped: "Спасибо, учту", not: "Ищу, кто поможет…", stale: "Спасибо, передам владельцу базы" };
  if (picked) return <Typography variant="body2" color="text.secondary" sx={{ display: "block", mt: 1 }}>{thanks[picked]}</Typography>;
  return <Stack direction="row" gap={1} mt={1} flexWrap="wrap">
    {options.map(([id, label]) => (
      <Button key={id} variant="text" size="small" sx={{ minHeight: 36, px: 1.5 }}
        onClick={() => { setPicked(id); if (id === "not") onNotHelpful(); }}>{label}</Button>
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

/** На компьютере — панель справа, на телефоне — шторка снизу (как в дизайн-системе Авито). */
export const ChatDrawer = ({ open, onClose, text, setText, messages, loading, onSend, login, look, onAction }: {
  open: boolean; onClose: () => void; text: string; setText: (text: string) => void; messages: ChatMessage[]; loading: boolean;
  onSend: (text?: string) => void; login: string; look: Lookup; onAction: () => void;
}) => {
  const theme = useTheme();
  const { t } = theme;
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, open]);
  return (
    <Drawer anchor={mobile ? "bottom" : "right"} open={open} onClose={onClose}
      slotProps={{ paper: { sx: mobile ? { height: "88dvh", borderTop: `1px solid ${t.line}` } : { width: 440, borderLeft: `1px solid ${t.line}` } } }}>
      <Stack height="100%" sx={{ bgcolor: t.bg }}>
        {mobile && <Box aria-hidden sx={{ width: 40, height: 4, bgcolor: t.line, mx: "auto", mt: 1 }} />}
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${t.line}` }}>
          <MascotBadge size={48} />
          <Box flex={1} minWidth={0}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography fontWeight={600} fontSize={17}>Напарник</Typography>
              <AiTag>ИИ</AiTag>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {loading ? "Думаю…" : "Без подтверждения ничего не отправит"}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Закрыть чат"><CloseRounded /></IconButton>
        </Stack>
        <Stack gap={2} sx={{ p: 2, flex: 1, overflowY: "auto" }}>
          {messages.map((m, index) => {
            const intro = m.role === "assistant" && index === 0 && messages.length === 1;
            return (
              <Box key={`${m.role}-${index}`} alignSelf={m.role === "user" ? "flex-end" : "stretch"}
                sx={{ maxWidth: m.role === "user" ? "92%" : "100%", width: m.role === "assistant" ? "100%" : undefined }}>
                <Box sx={{ px: 2, py: 1.5, bgcolor: m.role === "user" ? t.inverse : t.surface, color: m.role === "user" ? t.onInverse : t.text }}>
                  {m.role === "user" ? <Typography>{m.text}</Typography> : <Markdown text={m.text} />}
                </Box>
                {m.reply?.sources.map((s) => (
                  <Box key={s.page_id} sx={{ px: 1.5, py: 1.25, mt: 1, bgcolor: t.surface }}>
                    <Typography variant="body2" fontWeight={600}>{s.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{s.author} · {s.updated_at}{s.label ? ` · ${s.label}` : ""}</Typography>
                  </Box>
                ))}
                {m.reply?.drafts.map((d) => <DraftCard key={d.id} draft={d} login={login} look={look} onDone={onAction} />)}
                {m.reply && m.reply.sources.length > 0 && !m.reply.drafts.length && <Feedback onNotHelpful={() => onSend(`Не помогло, нужен человек: ${messages[index - 1]?.text ?? ""}`)} />}
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
          <div ref={end} />
        </Stack>
        <Stack direction="row" gap={1} sx={{ p: 1.5, borderTop: `1px solid ${t.line}` }}>
          <TextField autoFocus fullWidth multiline maxRows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Спроси о команде или задачах"
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
