// Оболочка Напарника: данные, роли, навигация. FSD: app → pages → widgets → features → entities → shared.
// Дизайн — по логике Avito Start и дизайн-системы Авито: плоско, линии 2 px, чёрная главная кнопка,
// цвета логотипа как акценты, фиолетовый — цвет ИИ. Главное на каждом экране — в первой строке.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Alert, Avatar, Badge, Box, BottomNavigation, BottomNavigationAction, Button, Container, IconButton, LinearProgress,
  ListItemText, Menu, MenuItem, Popover, Snackbar, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import {
  DescriptionOutlined, ForumOutlined, HomeOutlined, MenuBookOutlined,
  NotificationsNoneOutlined, TaskAltOutlined,
} from "@mui/icons-material";
import avitoLogo from "@/shared/assets/logo.svg";
import avitoLogoDark from "@/shared/assets/logo-dark.svg";
import { AppProviders } from "@/app/providers";
import { ThemeToggle } from "@/features/toggle-theme";
import { ChatDrawer, type ChatMessage, type Lookup } from "@/widgets/chat";
import {
  api, ApiError, unwrap, type ChatReply, type KbDraft, type KbFolder, type KbPage, type Me, type PlanData, type PlanStep,
  type Question, type RequestItem, type Services, type TeamOverview, type TodayData, type User,
} from "@/shared/api";
import { STORAGE } from "@/shared/config";
import { makeTheme, tokens, type Mode } from "@/shared/theme";
import { buildNotes, initials, requestTitle, statusOf, ROLE_RU, primaryRole, viewLabel, viewsFor, type DataState, type View } from "@/shared/lib";
import { Block, DaySkeleton, Empty, KnowledgeSkeleton, ListSkeleton, MascotBadge, Row, StatusTag } from "@/shared/ui";
import { DayPage } from "@/pages/day";
import { PlanPage } from "@/pages/plan";
import { QuestionsPage } from "@/pages/questions";
import { KnowledgePage } from "@/pages/knowledge";
import { RequestsPage } from "@/pages/requests";
import { BuddyPage } from "@/pages/buddy";
import { TeamPage } from "@/pages/team";

const ICONS: Record<View, ReactElement> = {
  day: <HomeOutlined />, plan: <TaskAltOutlined />, questions: <ForumOutlined />, knowledge: <MenuBookOutlined />, requests: <DescriptionOutlined />,
};
const GREETING: ChatMessage = { role: "assistant", text: "Привет! Спроси про команду, процессы или задачи. Могу оформить отгул или доступ — без твоего «Подтвердить» ничего не отправлю." };

const initialMode = (): Mode => {
  try { const saved = localStorage.getItem(STORAGE.theme); if (saved === "light" || saved === "dark") return saved; } catch { /* приватный режим */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const theme = useMemo(() => makeTheme(mode), [mode]);
  const t = tokens[mode];
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const wide = useMediaQuery(theme.breakpoints.up("lg"));

  const [login, setLogin] = useState(() => localStorage.getItem(STORAGE.login) ?? "intern.sokolov");
  const account = useRef(login);
  const generation = useRef(0);
  const loadSequence = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const actions = useRef(new Set<AbortController>());
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<View>("day");
  const [data, setData] = useState<DataState | null>(null);
  const [selectedIntern, setSelectedIntern] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState("");
  const [notesAnchor, setNotesAnchor] = useState<HTMLElement | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const role = data ? primaryRole(data.me.roles) : null;
  const views = role ? viewsFor(role) : [];
  const isCurrent = (owner: string, epoch: number) => account.current === owner && generation.current === epoch;

  useEffect(() => { try { localStorage.setItem(STORAGE.theme, mode); } catch { /* не критично */ } }, [mode]);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const seq = ++loadSequence.current;
    const epoch = generation.current;
    const current = () => account.current === login && generation.current === epoch && loadSequence.current === seq && !controller.signal.aborted;
    const options = { signal: controller.signal };
    const optionalPlan = async (id: string) => {
      try { return unwrap(await api<{ ok: boolean; data: PlanData }>(login, `/api/plans/${id}`, options)); }
      catch (e) { if (e instanceof ApiError && e.status === 404) return undefined; throw e; }
    };
    setLoading(true);
    setError("");
    try {
      const [me, usersPayload] = await Promise.all([api<Me>(login, "/api/me", options), api<{ users: User[] }>(login, "/api/users", options)]);
      if (!current()) return;
      setUsers(usersPayload.users);
      const r = primaryRole(me.roles);
      const [today, plan, questions, kb, requests, overview, managedPlans, services, drafts] = await Promise.all([
        r === "intern" ? api<{ ok: boolean; data: TodayData }>(login, "/api/today", options).then(unwrap) : undefined,
        r === "intern" ? optionalPlan(me.id) : undefined,
        api<{ questions: Question[] }>(login, "/api/questions", options),
        api<{ folders: KbFolder[]; pages: KbPage[] }>(login, "/api/kb/pages", options),
        r === "intern" || r === "lead" ? api<{ requests: RequestItem[] }>(login, "/api/requests", options) : undefined,
        r === "lead" ? api<{ ok: boolean; data: TeamOverview }>(login, "/api/dashboard/team", options).then(unwrap) : undefined,
        r === "buddy" ? Promise.all(me.interns.map(async (i) => ({ ...i, plan: await optionalPlan(i.id) }))) : [],
        r === "lead" || r === "intern" ? api<Services>(login, "/api/services", options) : undefined,
        api<{ drafts: KbDraft[] }>(login, "/api/kb/drafts", options).then((x) => x.drafts).catch(() => []),
      ]);
      if (!current()) return;
      setData({ me, users: usersPayload.users, today, plan, questions: questions.questions, folders: kb.folders, pages: kb.pages,
        requests: requests?.requests ?? [], overview, managedPlans, services, drafts });
      setSelectedIntern((prev) => me.interns.some((i) => i.id === prev) ? prev : me.interns[0]?.id ?? "");
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      if (current()) setLoading(false);
    }
  }, [login]);

  useEffect(() => { void load(); return () => { loadController.current?.abort(); }; }, [load]);
  useEffect(() => () => { actions.current.forEach((c) => c.abort()); }, []);
  // Чат на экране начинается с чистого листа — и разговор с агентом на сервере тоже.
  useEffect(() => { void api(login, "/api/chat/reset", { method: "POST", body: "{}" }).catch(() => undefined); }, [login]);

  const switchUser = (next: string) => {
    setAccountAnchor(null);
    if (next === account.current) return;
    account.current = next;
    generation.current++;
    loadSequence.current++;
    loadController.current?.abort();
    actions.current.forEach((c) => c.abort());
    actions.current.clear();
    localStorage.setItem(STORAGE.login, next);
    setData(null); setView("day"); setSelectedIntern(""); setBusy(false); setError(""); setSnack("");
    setChatText(""); setChatOpen(false); setChatLoading(false); setMessages([GREETING]);
    setLoading(true); setLogin(next);
  };

  const openChat = (prefill = "") => { setChatText(prefill); setChatOpen(true); };

  const sendChat = async (retry?: string) => {
    const text = (retry ?? chatText).trim();
    if (!text || chatLoading || account.current !== login) return;
    const owner = login, epoch = generation.current;
    const controller = new AbortController(); actions.current.add(controller);
    if (!retry) setChatText("");
    setMessages((m) => [...m, { role: "user", text }]); setChatLoading(true);
    try {
      const reply = await api<ChatReply>(owner, "/api/chat/messages", { method: "POST", body: JSON.stringify({ text }), signal: controller.signal });
      if (isCurrent(owner, epoch)) setMessages((m) => [...m, { role: "assistant", text: reply.text, reply, retryText: reply.retry ? text : undefined }]);
    } catch (e) {
      if (isCurrent(owner, epoch)) setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Не получилось ответить", retryText: text }]);
    } finally {
      actions.current.delete(controller);
      if (isCurrent(owner, epoch)) setChatLoading(false);
    }
  };

  /** Действие человека в интерфейсе: запрос → сообщение → перезагрузка данных. Ответы чужой учётки отбрасываются. */
  const perform = async (path: string, method: string, body: unknown, message: string) => {
    const owner = login, epoch = generation.current;
    if (account.current !== owner) return false;
    const controller = new AbortController(); actions.current.add(controller);
    setBusy(true);
    try {
      await api(owner, path, { method, body: JSON.stringify(body), signal: controller.signal });
      if (isCurrent(owner, epoch)) { setSnack(message); await load(); }
      return true;
    } catch (e) {
      if (isCurrent(owner, epoch)) setSnack(e instanceof Error ? e.message : "Не получилось");
      return false;
    } finally { actions.current.delete(controller); if (isCurrent(owner, epoch)) setBusy(false); }
  };

  const markDone = async (step: PlanStep) => {
    if (!data || (role !== "intern" && role !== "buddy")) return;
    const internId = role === "intern" ? data.me.id : selectedIntern;
    if (internId) await perform(`/api/plan-steps/${step.id}`, "PATCH", { intern_id: internId }, "Шаг отмечен — так держать");
  };
  const look: Lookup = {
    userName: (id) => (data?.users ?? users).find((u) => u.id === id)?.name ?? id,
    systemTitle: (id) => data?.services?.access.systems?.find((x) => x.system === id)?.title ?? id,
    stepTitle: (id) => data?.plan?.steps.find((x) => x.id === id)?.title ?? id,
  };

  const notes = data ? buildNotes({
    meId: data.me.id, today: data.me.today, steps: data.today?.steps ?? data.plan?.steps ?? [], questions: data.questions,
    requests: data.requests, drafts: data.drafts, events: data.today?.events ?? [],
  }) : [];
  const urgent = notes.filter((n) => n.urgent).length;
  // Новости дня: несрочные события (ответы, заявки) — без дублей с «Ближайшее»
  const news = notes.filter((n) => !n.urgent && n.go !== "day").slice(0, 5);
  const newsTag = (n: (typeof notes)[number]) => {
    if (n.id.startsWith("ans-")) return <StatusTag status="Answered" />;
    if (n.go === "requests") return <StatusTag status={/отклонен/i.test(n.text) ? "rejected" : "approved"} />;
    return <StatusTag status="Sent" label="Обновление" />;
  };

  const nav = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

  const page = () => {
    if (!data || !role) return null;
    if (view === "day") {
      if (role === "intern") return <DayPage data={data} onMarkDone={(s) => void markDone(s)} onAsk={openChat} onOpenPlan={() => nav("plan")} onOpenQuestions={() => nav("questions")}
        waiting={<Block title="Новости">{news.length ? news.map((n) => {
          const rejected = n.go === "requests" && /отклонен/i.test(n.text);
          const soft = n.id.startsWith("ans-") || (n.go === "requests" && !rejected) ? t.okSoft : rejected ? t.badSoft : undefined;
          return <Row key={n.id} title={n.text} sub={n.meta} end={newsTag(n)} onClick={() => nav(n.go)} sx={soft ? { bgcolor: soft } : undefined} />;
        }) : <Empty text="Ответы людей и статусы заявок появятся здесь." variant={0} />}</Block>} />;
      if (role === "lead") return <TeamPage overview={data.overview} onRequests={() => nav("requests")} />;
      if (role === "buddy") return <BuddyPage data={data} onPlan={(id) => { setSelectedIntern(id); nav("plan"); }} onQuestions={() => nav("questions")} />;
    }
    if (view === "plan" && role === "intern") return <PlanPage plan={data.plan} title="Мой план" context={`${data.me.week}-я неделя · ${data.me.department}`} today={data.me.today} onMarkDone={(s) => void markDone(s)} />;
    if (view === "plan" && role === "buddy") {
      const chosen = data.managedPlans.find((i) => i.id === selectedIntern);
      return <PlanPage plan={chosen?.plan} title={chosen ? `План: ${chosen.name}` : "План стажёра"} context="Бадди может отмечать шаги стажёра" today={data.me.today}
        onMarkDone={(s) => void markDone(s)}
        picker={data.managedPlans.length > 1 && <TextField select size="small" label="Стажёр" value={selectedIntern} onChange={(e) => setSelectedIntern(e.target.value)} sx={{ minWidth: 220 }}>
          {data.managedPlans.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}</TextField>} />;
    }
    if (view === "questions" || (view === "day" && role === "expert")) return <QuestionsPage data={data} role={role} onAsk={() => openChat()}
      onAnswer={(q, text) => perform(`/api/questions/${q.id}/answer`, "POST", { text }, "Ответ ушёл стажёру. Проверь страницу для базы")}
      onApprove={async (d, title, body) => { await perform(`/api/kb/pages/${d.id}/approve`, "POST", { title, body }, "Страница опубликована в базе знаний"); }} />;
    if (view === "knowledge") return <KnowledgePage data={data} onAsk={openChat} />;
    if (view === "requests") return <RequestsPage data={data} login={login} isLead={role === "lead"} busy={busy} onAgent={() => openChat("Мне нужен отгул ")}
      onSent={(m) => { setSnack(m); void load(); }}
      onMarkStep={role === "intern" ? (id) => { const st = data.plan?.steps.find((x) => x.id === id); if (st) void markDone(st); } : undefined}
      onDecide={async (r, decision, reason, comment) => {
        await perform(`/api/requests/${r.id}/decision`, "POST", { decision, reason, comment },
          decision === "approve" ? `${requestTitle(r)}: ${statusOf(r.kind === "access" ? "granted" : "approved").label.toLowerCase()}` : "Заявка отклонена, стажёр увидит причину");
      }} />;
    return null;
  };

  const me = data?.me;
  const others = users.filter((u) => u.login !== login);

  return (
    <AppProviders theme={theme}>
      <Box sx={{ minHeight: "100dvh", pb: { xs: 10, md: 0 }, bgcolor: t.bg }}>
        <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: t.bg, borderBottom: `1px solid ${t.line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ display: "flex", alignItems: "center", height: (th) => th.size.header, gap: 0.5 }}>
              <Box component="a" href="#" aria-label={role ? viewLabel(role, "day") : "На главную"}
                onClick={(e) => {
                  e.preventDefault();
                  if (view === "day") window.scrollTo({ top: 0, behavior: "smooth" });
                  else nav("day");
                }}
                sx={{ display: "flex", alignItems: "center", flex: "none" }}>
                <Box component="img" src={mode === "dark" ? avitoLogoDark : avitoLogo} alt="" sx={{ height: 28, width: "auto", display: "block" }} />
              </Box>
              {/* Nav hug ровно посередине между лого и кнопкой темы */}
              <Box sx={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
                {!mobile && role && <Stack component="nav" aria-label="Разделы" direction="row" gap={0.5} sx={{ flex: "none", maxWidth: "100%", overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none", "&::-webkit-scrollbar": { display: "none" } }}>
                  {views.map((v) => {
                    const active = view === v;
                    return <Box key={v} component="button" onClick={() => nav(v)} aria-current={active ? "page" : undefined} sx={{
                      font: "inherit", fontSize: (th) => th.type.size.base, border: "none", bgcolor: "transparent", color: t.text,
                      px: { md: 1.25, lg: 1.75 }, height: (th) => th.size.header, whiteSpace: "nowrap",
                      fontWeight: (th) => (active ? th.type.weight.semibold : th.type.weight.medium), letterSpacing: (th) => th.type.tracking.normal,
                      transition: (th) => `color ${th.motion.base}`, userSelect: "none", WebkitTapHighlightColor: "transparent",
                      "&:hover": { color: mode === "light" ? "rgba(0,0,0,0.5)" : "rgba(243,243,243,0.5)" },
                      "&:active, &:focus": { color: t.text, bgcolor: "transparent", outline: "none" },
                      "&:focus-visible": { outline: `2px solid ${t.link}`, outlineOffset: 2 },
                    }}>{viewLabel(role, v)}</Box>;
                  })}
                </Stack>}
              </Box>
              <ThemeToggle mode={mode} onToggle={() => setMode(mode === "light" ? "dark" : "light")} />
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ flex: "none" }}>
                <IconButton aria-label={`Уведомления: ${notes.length}`} onClick={(e) => setNotesAnchor(e.currentTarget)}>
                  <Badge badgeContent={urgent} sx={{ "& .MuiBadge-badge": { bgcolor: "error.main", color: "#000", fontWeight: 700, borderRadius: 0 } }}><NotificationsNoneOutlined /></Badge>
                </IconButton>
                <Box component="button" onClick={(e) => setAccountAnchor(e.currentTarget)} aria-label="Тестовая учётка — сменить роль" sx={{
                  display: "flex", alignItems: "center", gap: 1, font: "inherit", border: "none", bgcolor: "transparent", color: "inherit", px: 1, py: 0.5, "&:hover": { bgcolor: t.surface },
                }}>
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: t.todaySoft, color: t.text }}>{me ? initials(me.name) : "…"}</Avatar>
                  {wide && me && <Box textAlign="left"><Typography variant="body2" fontWeight={600} lineHeight={1.2}>{me.name}</Typography><Typography variant="caption" color="text.secondary">{role && ROLE_RU[role]} · демо</Typography></Box>}
                </Box>
              </Stack>
            </Box>
          </Container>
        </Box>
        {loading && <LinearProgress aria-label="Загрузка" sx={{ position: "fixed", top: 64, left: 0, right: 0, zIndex: 11, height: 2 }} />}

        <Container maxWidth="lg" component="main" sx={{ pt: { xs: 3, md: 5 }, pb: { xs: 10, md: 12 } }}>
          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 0 }} action={<Button variant="text" onClick={() => void load()}>Повторить</Button>}>Не получилось загрузить данные: {error}</Alert>}
          {data && data.me.login === login ? page() : !error && (
            view === "knowledge" ? <KnowledgeSkeleton />
              : view === "day" ? <DaySkeleton />
              : <ListSkeleton plates={view === "plan" ? 3 : 2} rows={view === "plan" ? 4 : 3} />
          )}
        </Container>

        {mobile && role && <BottomNavigation component="nav" aria-label="Разделы" showLabels value={view} onChange={(_, v: View) => nav(v)} sx={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, height: 64, bgcolor: t.bg, borderTop: `2px solid ${t.line}`,
          "& .MuiBottomNavigationAction-root": { minWidth: 0, color: t.muted, px: 0.5 }, "& .Mui-selected": { color: `${t.text} !important` },
          "& .MuiBottomNavigationAction-label": { fontSize: "11px !important", lineHeight: 1.2, whiteSpace: "nowrap" },
        }}>
          {views.map((v) => <BottomNavigationAction key={v} value={v} label={viewLabel(role, v)} icon={ICONS[v]} />)}
        </BottomNavigation>}

        {/* Маскот — на всех экранах, 96 px (08-DESIGN): клик открывает чат, бейдж — сколько ждёт внимания,
            «Думаю…» — пока отвечает модель. Плавное «дыхание» отключается при prefers-reduced-motion. */}
        {role && !chatOpen && <Box component="button" onClick={() => openChat()} aria-label="Открыть чат с Напарником" sx={{
          position: "fixed", right: { xs: 8, md: 24 }, bottom: { xs: 70, md: 20 }, zIndex: 12, p: 0, border: "none", bgcolor: "transparent",
          overflow: "visible", lineHeight: 0,
          transition: "transform .2s ease", "&:hover, &:focus-visible": { transform: "translateY(-3px)" },
          "&:hover .mascot-label, &:focus-visible .mascot-label": { opacity: 1, transform: "translateY(-50%)" },
        }}>
          <MascotBadge
            size={mobile ? 72 : 96}
            float
            badge={urgent > 0 ? (
              <Box component="span" sx={{
                position: "absolute", top: { xs: 4, md: 8 }, right: { xs: 4, md: 8 },
                minWidth: 22, height: 22, px: 0.5, borderRadius: 0,
                bgcolor: "error.main", color: "#000", fontSize: 12, fontWeight: 700,
                border: `2px solid ${t.bg}`, display: "inline-flex", alignItems: "center", justifyContent: "center",
                boxSizing: "border-box",
              }}>{urgent}</Box>
            ) : undefined}
          />
          <Box component="span" className="mascot-label" sx={{
            position: "absolute", right: "100%", top: "50%", mr: 1.5,
            px: 1.5, py: 1, bgcolor: t.inverse, color: t.onInverse,
            fontSize: 13, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap",
            opacity: chatLoading ? 1 : 0,
            transform: chatLoading ? "translateY(-50%)" : "translate(8px, -50%)",
            transition: "opacity .2s ease, transform .2s ease",
            pointerEvents: "none", display: { xs: "none", md: "block" },
            "&::after": {
              content: '""', position: "absolute", left: "100%", top: "50%",
              transform: "translateY(-50%)",
              borderStyle: "solid", borderWidth: "6px 0 6px 6px",
              borderColor: `transparent transparent transparent ${t.inverse}`,
            },
          }}>{chatLoading ? "Думаю…" : urgent ? `Есть новое: ${urgent}` : "Спроси меня"}</Box>
        </Box>}

        <Popover open={Boolean(notesAnchor)} anchorEl={notesAnchor} onClose={() => setNotesAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { width: 360, maxWidth: "calc(100vw - 24px)", maxHeight: 480 } } }}>
          {/* Отступы Akita: снаружи 8, заголовок и строки — 16 внутри */}
          <Box sx={{ py: 1 }}>
            <Typography variant="h3" component="h2" sx={{ px: 2, pt: 1, pb: 1.5 }}>Уведомления</Typography>
            {notes.length ? notes.map((n) => <Row key={n.id} title={n.text} sub={n.meta} onClick={() => { setNotesAnchor(null); nav(n.go); }}
              end={n.urgent ? <StatusTag status="Overdue" label="нужно действие" /> : undefined} sx={{ px: 2 }} />)
              : <Box sx={{ px: 2 }}><Empty text="Всё спокойно — новых событий нет." variant={2} /></Box>}
          </Box>
        </Popover>

        <Menu open={Boolean(accountAnchor)} anchorEl={accountAnchor} onClose={() => setAccountAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 320, maxWidth: "calc(100vw - 24px)" } } }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1.5, pb: 1, display: "block" }}>Тестовые учётки · войти как</Typography>
          {others.map((u) => <MenuItem key={u.login} onClick={() => switchUser(u.login)}>
            <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: t.surface, color: t.text }}>{initials(u.name)}</Avatar>
            <ListItemText primary={u.name} secondary={`${ROLE_RU[primaryRole(u.roles)]} · ${u.position}`} />
          </MenuItem>)}
        </Menu>

        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} text={chatText} setText={setChatText} messages={messages} loading={chatLoading}
          onSend={(retry) => void sendChat(retry)} login={login} look={look} onAction={() => void load()} />
        <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack("")} message={snack}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }} sx={{ bottom: { xs: 88, md: 24 } }} />
      </Box>
    </AppProviders>
  );
}

export default App;
