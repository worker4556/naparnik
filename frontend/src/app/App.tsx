// Оболочка Напарника: данные, роли, навигация. FSD: app → pages → widgets → features → entities → shared.
// Дизайн — по логике Avito Start и дизайн-системы Авито: плоско, линии 2 px, чёрная главная кнопка,
// цвета логотипа как акценты, фиолетовый — цвет ИИ. Главное на каждом экране — в первой строке.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Alert, Avatar, Badge, Box, BottomNavigation, BottomNavigationAction, Button, Container, Dialog,
  IconButton, LinearProgress, Divider, ListItemText, Menu, MenuItem, Popover, Snackbar, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import {
  AccountCircleOutlined, AutoStoriesOutlined, ChatBubbleOutlineOutlined, DescriptionOutlined, HomeOutlined,
  ListAltOutlined, NotificationsNoneOutlined, SendOutlined, SettingsOutlined, VisibilityOutlined,
} from "@mui/icons-material";
import avitoLogo from "@/shared/assets/logo.svg";
import avitoLogoDark from "@/shared/assets/logo-dark.svg";
import { AppProviders } from "@/app/providers";
import { ThemeToggle } from "@/features/toggle-theme";
import { ChatDrawer, type ChatMessage, type Lookup } from "@/widgets/chat";
import { ProfileAvatar, ProfileDialog } from "@/widgets/profile";
import { PlanDraftDialog } from "@/widgets/plan-draft";
import { TeamMapDialog } from "@/widgets/team-map";
import { TelegramDialog } from "@/widgets/telegram";
import { SettingsDialog } from "@/widgets/settings";
import { Mascot3D, moodLabel, useMascotMood, useMascotPlacement } from "@/widgets/mascot";
import { PracticePanel } from "@/widgets/practice";
import { LeadPanels } from "@/widgets/lead-panels";
import { KbSupport } from "@/widgets/kb-support";
import {
  api, ApiError, getProfile, subscribeChanges, unwrap, type ChatReply, type Meeting, type KbDraft, type KbFolder, type KbPage, type Me, type PlanData, type PlanStep,
  type Question, type RequestItem, type Services, type TeamOverview, type TodayData, type User, type ChatHistory, type ChatTurn,
} from "@/shared/api";
import { STORAGE } from "@/shared/config";
import { makeTheme, tokens, type Mode } from "@/shared/theme";
import { buildNotes, initials, requestTitle, statusOf, ROLE_RU, primaryRole, mobileNavLabel, viewLabel, viewsFor, type DataState, type Note, type View } from "@/shared/lib";
import { Block, DaySkeleton, DialogClose, Empty, KnowledgeSkeleton, ListSkeleton, Row, StatusTag } from "@/shared/ui";
import { DayPage } from "@/pages/day";
import { PlanPage } from "@/pages/plan";
import { QuestionsPage } from "@/pages/questions";
import { KnowledgePage } from "@/pages/knowledge";
import { RequestsPage } from "@/pages/requests";
import { BuddyPage } from "@/pages/buddy";
import { TeamPage } from "@/pages/team";

// Нижняя навигация: один набор Outlined, без «жирных» TaskAlt/MenuBook — как плоские иконки Akita.
const navIconSx = { fontSize: 20 };
const ICONS: Record<View, ReactElement> = {
  day: <HomeOutlined sx={navIconSx} />,
  plan: <ListAltOutlined sx={navIconSx} />,
  questions: <ChatBubbleOutlineOutlined sx={navIconSx} />,
  knowledge: <AutoStoriesOutlined sx={navIconSx} />,
  requests: <DescriptionOutlined sx={navIconSx} />,
};
// Уведомления, которых нет в данных экранов: расписание, устаревшая страница, назначение владельца базы.
// BR-34: kb_owner приходит отдельным событием — восстановить его из списка вопросов нельзя.
const SERVER_ONLY = ["morning_plan", "event_reminder", "page_stale", "kb_owner"];
type ServerNote = { id: string; type: string; text: string; view: View; read: boolean };

const GREETING: ChatMessage = { role: "assistant", text: "Привет! Спроси про команду, процессы или задачи. Могу оформить отгул или доступ — без твоего «Подтвердить» ничего не отправлю." };

/** Сохранённые ходы текущего разговора — обратно в окно чата. */
const turnsToMessages = (turns: ChatTurn[]): ChatMessage[] => turns.flatMap((x): ChatMessage[] => [
  { role: "user", text: x.question },
  { role: "assistant", text: x.reply.text, reply: x.reply, retryText: x.reply.retry ? x.question : undefined },
]);

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
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  // Вопросы Напарнику хранит сервер: окно чата и «Мои вопросы» переживают закрытие чата, перезагрузку и перезапуск.
  const [asked, setAsked] = useState<ChatTurn[]>([]);
  const conversation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState("");
  const [notesAnchor, setNotesAnchor] = useState<HTMLElement | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  // Карточка профиля (SCR-I5a): null — закрыта, "" — своя, иначе ID сотрудника.
  const [profileOf, setProfileOf] = useState<string | null>(null);
  // Черновик плана стажёра (SC-20): ID стажёра или "" — закрыт.
  const [planDraftOf, setPlanDraftOf] = useState("");
  // Карта команды (SCR-I5) и страница базы, которую открыть по ссылке из неё.
  const [teamOpen, setTeamOpen] = useState(false);
  const [tgOpen, setTgOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Ответ пришёл, пока чат закрыт, — маскот радуется и ждёт, пока его откроют (08-DESIGN §2.2 has_answer).
  const [answerWaiting, setAnswerWaiting] = useState(false);
  // Что из важного человек уже видел (открыл чат или колокольчик): маскот машет письмом только на новое.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const markSeenRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    try { setSeen(new Set(JSON.parse(localStorage.getItem(`naparnik.mascot.seen.${login}`) ?? "[]") as string[])); }
    catch { setSeen(new Set()); }
  }, [login]);
  const [serverNotes, setServerNotes] = useState<ServerNote[]>([]);
  // Практика пересчитывается после ответа Напарника: он мог начать или продвинуть её из чата.
  const [practiceRevision, setPracticeRevision] = useState(0);
  const [kbOpen, setKbOpen] = useState("");
  const clearKbOpen = useCallback(() => setKbOpen(""), []);
  const [myPhoto, setMyPhoto] = useState<{ login: string; url: string | null }>({ login: "", url: null });
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
      const [today, plan, questions, kb, requests, overview, managedPlans, services, drafts, meetings] = await Promise.all([
        r === "intern" ? api<{ ok: boolean; data: TodayData }>(login, "/api/today", options).then(unwrap) : undefined,
        r === "intern" ? optionalPlan(me.id) : undefined,
        api<{ questions: Question[] }>(login, "/api/questions", options),
        api<{ folders: KbFolder[]; pages: KbPage[] }>(login, "/api/kb/pages", options),
        r === "intern" || r === "lead" ? api<{ requests: RequestItem[] }>(login, "/api/requests", options) : undefined,
        r === "lead" ? api<{ ok: boolean; data: TeamOverview }>(login, "/api/dashboard/team", options).then(unwrap) : undefined,
        r === "buddy" ? Promise.all(me.interns.map(async (i) => ({ ...i, plan: await optionalPlan(i.id) }))) : [],
        r === "lead" || r === "intern" ? api<Services>(login, "/api/services", options) : undefined,
        api<{ drafts: KbDraft[] }>(login, "/api/kb/drafts", options).then((x) => x.drafts).catch(() => []),
        api<{ meetings: Meeting[] }>(login, "/api/meetings", options).then((x) => x.meetings).catch(() => []),
      ]);
      if (!current()) return;
      setData({ me, users: usersPayload.users, today, plan, questions: questions.questions, folders: kb.folders, pages: kb.pages,
        requests: requests?.requests ?? [], overview, managedPlans, services, drafts, meetings });
      setSelectedIntern((prev) => me.interns.some((i) => i.id === prev) ? prev : me.interns[0]?.id ?? "");
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      if (current()) setLoading(false);
    }
  }, [login]);

  const reload = useRef(load);
  reload.current = load;
  useEffect(() => { void load(); return () => { loadController.current?.abort(); }; }, [load]);
  useEffect(() => {
    let alive = true;
    const pull = () => api<{ notifications: ServerNote[] }>(login, "/api/notifications")
      .then((r) => { if (alive) setServerNotes(r.notifications.filter((n) => SERVER_ONLY.includes(n.type))); }).catch(() => undefined);
    void pull();
    const timer = setInterval(pull, 30000); // запасной путь, если живой поток недоступен
    // Живые обновления: ответ эксперта, решение по заявке, новое уведомление — экран обновляется сам.
    let soon: ReturnType<typeof setTimeout> | undefined;
    const stop = subscribeChanges(login, () => {
      clearTimeout(soon);
      soon = setTimeout(() => { void pull(); void reload.current(); }, 300);
    });
    return () => { alive = false; clearInterval(timer); clearTimeout(soon); stop(); };
  }, [login]);
  useEffect(() => () => { actions.current.forEach((c) => c.abort()); }, []);
  // Чат на экране начинается с чистого листа — и разговор с агентом на сервере тоже.
  // Своё фото — для аватара в шапке; без фото остаются инициалы.
  useEffect(() => {
    const controller = new AbortController();
    getProfile(login, undefined, { signal: controller.signal }).then((p) => setMyPhoto({ login, url: p.photo?.url ?? null })).catch(() => undefined);
    return () => controller.abort();
  }, [login]);
  useEffect(() => {
    const controller = new AbortController();
    api<ChatHistory>(login, "/api/chat/history", { signal: controller.signal }).then((h) => {
      if (account.current !== login) return;
      conversation.current = h.conversation;
      const turns = h.turns;
      setAsked(turns);
      // Если человек уже успел написать, пока грузилась история, его сообщения не затираем.
      setMessages((m) => (m.length > 1 ? m : [GREETING, ...turnsToMessages(h.turns.filter((x) => x.conversation === h.conversation))]));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [login]);

  /** «Новый разговор»: окно чата пустеет, модель забывает контекст, сохранённые вопросы остаются. */
  const newConversation = async () => {
    const owner = login;
    try {
      await api(owner, "/api/chat/reset", { method: "POST", body: "{}" });
      if (account.current !== owner) return;
      conversation.current++;
      setMessages([GREETING]);
    } catch (e) {
      setSnack(e instanceof Error ? e.message : "Не получилось начать новый разговор");
    }
  };

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
    setProfileOf(null); setPlanDraftOf(""); setTeamOpen(false); setKbOpen(""); setTgOpen(false); setSettingsOpen(false); setServerNotes([]);
    setData(null); setView("day"); setSelectedIntern(""); setBusy(false); setError(""); setSnack("");
    setChatText(""); setChatOpen(false); setChatLoading(false); setMessages([GREETING]); setAsked([]);
    setLoading(true); setLogin(next);
  };

  const openChat = (prefill = "") => { setChatText(prefill); setChatOpen(true); setAnswerWaiting(false); markSeenRef.current(); };

  const sendChat = async (retry?: string) => {
    const text = (retry ?? chatText).trim();
    if (!text || chatLoading || account.current !== login) return;
    const owner = login, epoch = generation.current;
    const controller = new AbortController(); actions.current.add(controller);
    if (!retry) setChatText("");
    setMessages((m) => [...m, { role: "user", text }]); setChatLoading(true);
    try {
      const reply = await api<ChatReply>(owner, "/api/chat/messages", { method: "POST", body: JSON.stringify({ text }), signal: controller.signal });
      if (isCurrent(owner, epoch)) {
        setMessages((m) => [...m, { role: "assistant", text: reply.text, reply, retryText: reply.retry ? text : undefined }]);
        if (!chatOpenRef.current) setAnswerWaiting(true);
        setAsked((a) => [...a, { id: `local-${Date.now()}`, conversation: conversation.current, question: text, at: new Date().toISOString(), reply }]);
        setPracticeRevision((n) => n + 1);
      }
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
  notes.unshift(...serverNotes.filter((n) => !n.read).map((n) => ({ id: n.id, text: n.text.split("\n")[0], meta: n.text.split("\n").slice(1).join(" ") || "Напарник",
    urgent: n.type === "page_stale" || (n.type === "kb_owner" && !seen.has(n.id)), go: (n.view === "plan" ? "day" : n.view) as Note["go"] })));
  const urgent = notes.filter((n) => n.urgent).length;
  // Важное: срочное, ответы людей, решения по заявкам. Новое — то, чего человек ещё не видел.
  const important = notes.filter((n) => n.urgent || n.id.startsWith("ans-") || n.id.startsWith("r-")).map((n) => n.id);
  const unseen = important.filter((id) => !seen.has(id));
  const markSeen = () => {
    if (!unseen.length) return;
    const next = new Set([...seen, ...important]);
    setSeen(next);
    try { localStorage.setItem(`naparnik.mascot.seen.${login}`, JSON.stringify([...next])); } catch { /* приватный режим — только до перезагрузки */ }
  };
  markSeenRef.current = markSeen;
  const lastMessage = messages[messages.length - 1];
  const mascotSize = mobile ? 72 : 96;
  const placement = useMascotPlacement(login, mascotSize * 1.2, mobile ? 80 : 20);
  const { place } = placement;
  const { mood } = useMascotMood({
    thinking: chatLoading,
    error: lastMessage?.role === "assistant" && Boolean(lastMessage.retryText) && !lastMessage.reply,
    hasAnswer: answerWaiting || unseen.some((id) => id.startsWith("ans-") || id.startsWith("r-")),
    needsConfirm: unseen.some((id) => id.startsWith("d-")),
    reminder: unseen.some((id) => id.startsWith("o-") || id.startsWith("in-") || id.startsWith("a-")),
  });
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
      if (role === "intern") return <DayPage data={data} asked={asked} onTeam={() => setTeamOpen(true)} onMarkDone={(s) => void markDone(s)} onAsk={openChat} onOpenPlan={() => nav("plan")} onOpenQuestions={() => nav("questions")}
        practice={<PracticePanel key={login} login={login} buddy={false} revision={practiceRevision} flush />}
        waiting={<Block title="Новости">{news.length ? news.map((n) => (
          <Row key={n.id} title={n.text} sub={n.meta} end={newsTag(n)} onClick={() => nav(n.go)} />
        )) : <Empty text="Ответы людей и статусы заявок появятся здесь." icon={false} />}</Block>} />;
      if (role === "lead") return <><TeamPage overview={data.overview} onRequests={() => nav("requests")} onProfile={setProfileOf} onPlanDraft={setPlanDraftOf} />
        <LeadPanels login={login} users={data.users} onAction={perform} /></>;
      if (role === "buddy") return <BuddyPage data={data} onPlan={(id) => { setSelectedIntern(id); nav("plan"); }} onQuestions={() => nav("questions")} onProfile={setProfileOf} onPlanDraft={setPlanDraftOf} />;
    }
    if (view === "plan" && role === "intern") return <PlanPage plan={data.plan} title="Мой план" context={`${data.me.week}-я неделя · ${data.me.department}`} today={data.me.today} onMarkDone={(s) => void markDone(s)} onTeam={() => setTeamOpen(true)} />;
    if (view === "plan" && role === "buddy") {
      const chosen = data.managedPlans.find((i) => i.id === selectedIntern);
      return <PlanPage plan={chosen?.plan} title={chosen ? `План: ${chosen.name}` : "План стажёра"} context="Бадди может отмечать шаги стажёра" today={data.me.today}
        onManage={chosen ? () => setPlanDraftOf(chosen.id) : undefined}
        onMarkDone={(s) => void markDone(s)}
        picker={data.managedPlans.length > 1 && (
          <Box sx={{ minWidth: 220 }}>
            <Typography
              component="label"
              htmlFor="buddy-intern-pick"
              id="buddy-intern-label"
              variant="body2"
              fontWeight={600}
              sx={{ display: "block", mb: 0.75 }}
            >
              Стажёр
            </Typography>
            <TextField
              id="buddy-intern-pick"
              slotProps={{ select: { labelId: "buddy-intern-label" } }}
              select
              size="small"
              fullWidth
              value={selectedIntern}
              onChange={(e) => setSelectedIntern(e.target.value)}
            >
              {data.managedPlans.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
            </TextField>
          </Box>
        )} />;
    }
    if (view === "questions" || (view === "day" && role === "expert")) return <QuestionsPage data={data} role={role} login={login} asked={asked} onAction={perform} onAsk={() => openChat()} onOpenChat={() => setChatOpen(true)}
      onAnswer={(q, text) => perform(`/api/questions/${q.id}/answer`, "POST", { text }, "Ответ ушёл стажёру. Проверь страницу для базы")}
      onApprove={async (d, title, body) => { await perform(`/api/kb/pages/${d.id}/approve`, "POST", { title, body }, "Страница опубликована в базе знаний"); }} />;
    // Владельцу базы, если это не руководитель (BR-34), «Поддержка базы» — под базой знаний.
    if (view === "knowledge") return <><KnowledgePage data={data} onAsk={openChat} openId={kbOpen} onOpened={clearKbOpen} />
      {role !== "lead" && role !== "intern" && <Box mt={{ xs: 2, md: 5 }}><KbSupport login={login} users={data.users} onAction={perform} /></Box>}</>;
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
      <Box sx={{ minHeight: "100%", bgcolor: t.bg }}>
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
                <IconButton aria-label={`Уведомления: ${notes.length}`} onClick={(e) => { setNotesAnchor(e.currentTarget); markSeen(); }}>
                  <Badge badgeContent={urgent} sx={{ "& .MuiBadge-badge": { bgcolor: "error.main", color: "#000", fontWeight: 700, borderRadius: 0 } }}><NotificationsNoneOutlined /></Badge>
                </IconButton>
                <Box component="button" onClick={(e) => setAccountAnchor(e.currentTarget)} aria-label="Профиль и тестовые учётки" sx={{
                  display: "flex", alignItems: "center", gap: 1, font: "inherit", border: "none", bgcolor: "transparent", color: "inherit", px: 1, py: 0.5, "&:hover": { bgcolor: t.surface },
                }}>
                  {me ? <ProfileAvatar login={login} photoUrl={myPhoto.login === login ? myPhoto.url : null} initials={initials(me.name)} /> : <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: t.todaySoft, color: t.text }}>…</Avatar>}
                  {wide && me && <Box textAlign="left"><Typography variant="body2" fontWeight={600} lineHeight={1.2}>{me.name}</Typography><Typography variant="caption" color="text.secondary">{role && ROLE_RU[role]} · демо</Typography></Box>}
                </Box>
              </Stack>
            </Box>
          </Container>
          {loading && (
            <LinearProgress
              aria-label="Загрузка"
              sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2 }}
            />
          )}
        </Box>

        <Container
          maxWidth="lg"
          component="main"
          sx={{
            pt: { xs: 2.5, md: 5 },
            // Мобилка: зазор над нижней навигацией + safe-area.
            pb: { xs: "calc(64px + 12px + env(safe-area-inset-bottom, 0px))", md: 12 },
            px: { xs: 2, sm: 3 },
          }}
        >
          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 0 }} action={<Button variant="text" onClick={() => void load()}>Повторить</Button>}>Не получилось загрузить данные: {error}</Alert>}
          {data && data.me.login === login ? page() : !error && (
            view === "knowledge" ? <KnowledgeSkeleton />
              : view === "day" ? <DaySkeleton />
              : <ListSkeleton plates={view === "plan" ? 3 : 2} rows={view === "plan" ? 4 : 3} />
          )}
          {/* Практика: у стажёра на «Моём дне» вшита в DayPage (на мобилке — перед вопросами/новостями). */}
          {data && data.me.login === login && (role === "intern" || role === "buddy") && (view === "day" || view === "plan") &&
            !(role === "intern" && view === "day") &&
            <PracticePanel key={login} login={login} buddy={role === "buddy"} revision={practiceRevision} />}
        </Container>

        {mobile && role && <BottomNavigation component="nav" aria-label="Разделы" showLabels value={view} onChange={(_, v: View) => nav(v)} sx={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10,
          height: "calc(64px + env(safe-area-inset-bottom, 0px))",
          pb: "env(safe-area-inset-bottom, 0px)",
          bgcolor: t.bg, borderTop: `2px solid ${t.line}`,
          // Без MUI-анимации «подпрыгивающей» подписи — только цвет, как у десктоп-навигации.
          "& .MuiBottomNavigationAction-root": {
            minWidth: 0,
            px: 0.25,
            py: 0,
            gap: "2px",
            color: mode === "light" ? "#A3A4A3" : "rgba(243,243,243,0.45)",
            transition: (th) => `color ${th.motion.fast}`,
            WebkitTapHighlightColor: "transparent",
            "& .MuiSvgIcon-root": { display: "block", transition: "none" },
            "&:active": { bgcolor: "transparent" },
          },
          "& .Mui-selected": {
            color: `${mode === "light" ? "#5C5C5C" : "rgba(243,243,243,0.82)"} !important`,
            paddingTop: "0 !important",
          },
          "& .MuiBottomNavigationAction-label": {
            fontSize: "11px !important",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            opacity: "1 !important",
            transition: "none",
            fontWeight: (th) => th.type.weight.medium,
            "&.Mui-selected": {
              fontSize: "11px !important",
              fontWeight: (th) => th.type.weight.medium,
            },
          },
        }}>
          {views.map((v) => (
            <BottomNavigationAction key={v} value={v} label={mobileNavLabel(role, v)} aria-label={viewLabel(role, v)} icon={ICONS[v]} disableRipple />
          ))}
        </BottomNavigation>}

        {/* Маскот — на всех экранах, 96 px (08-DESIGN): клик открывает чат, бейдж — сколько ждёт внимания,
            «Думаю…» — пока отвечает модель. Плавное «дыхание» отключается при prefers-reduced-motion. */}
        {/* Перетаскивается к любому краю, меню по правому клику или долгому нажатию (08-DESIGN §2.5). */}
        {role && !chatOpen && !placement.hidden && <Box component="button" {...placement.handlers}
          onClick={() => { if (placement.consumeClick()) return; if (place.minimized) placement.minimize(false); else openChat(); }}
          aria-label={place.minimized ? "Развернуть Напарника" : "Открыть чат с Напарником"} aria-description={`Напарник: ${moodLabel(mood).toLowerCase()}. Меню — правой кнопкой`} data-mood={mood}
          data-edge={place.edge}
          style={placement.drag ? { left: placement.drag.x - mascotSize * 0.6, top: placement.drag.y - mascotSize * 0.6, right: "auto", bottom: "auto", transition: "none", cursor: "grabbing" } : undefined}
          sx={{
          position: "fixed",
          // Числа в sx — это spacing×8, поэтому отступы маскота только в px.
          [place.edge]: { xs: "8px", md: "24px" },
          bottom: `${place.bottom}px`,
          zIndex: 12, p: 0, border: "none", bgcolor: "transparent",
          overflow: "visible", lineHeight: 0,
          // pan-y — страница скроллится; none только во время драга маскота.
          touchAction: placement.drag ? "none" : "pan-y",
          cursor: "grab",
          transition: "transform .2s ease, left .25s ease, right .25s ease, bottom .25s ease", "&:hover, &:focus-visible": { transform: "translateY(-3px)" },
          "&:hover .mascot-label, &:focus-visible .mascot-label": { opacity: 1, transform: "translateY(-50%)" },
        }}>
          {place.minimized ? <Box component="span" sx={{
            display: "block", width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.main", border: `3px solid ${t.bg}`,
            boxShadow: "0 2px 8px rgba(0,0,0,.25)", position: "relative",
            ...(urgent > 0 && { "&::after": { content: '""', position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", bgcolor: "error.main" } }),
          }} /> : <Mascot3D
            size={mascotSize}
            mood={mood}
            mail={urgent > 0}
            badge={urgent > 0 ? (
              <Box component="span" sx={{
                position: "absolute", top: { xs: 4, md: 8 }, right: { xs: 4, md: 8 },
                minWidth: 22, height: 22, px: 0.5, borderRadius: 0,
                bgcolor: "error.main", color: "#000", fontSize: 12, fontWeight: 700,
                border: `2px solid ${t.bg}`, display: "inline-flex", alignItems: "center", justifyContent: "center",
                boxSizing: "border-box",
                backfaceVisibility: "hidden",
              }}>{urgent}</Box>
            ) : undefined}
          />}
          <Box component="span" className="mascot-label" sx={{
            position: "absolute", top: "50%", ...(place.edge === "right" ? { right: "100%", mr: 1.5 } : { left: "100%", ml: 1.5 }),
            px: 1.5, py: 1, bgcolor: t.inverse, color: t.onInverse,
            fontSize: 13, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap",
            opacity: chatLoading && !placement.drag ? 1 : 0,
            transform: chatLoading ? "translateY(-50%)" : `translate(${place.edge === "right" ? 8 : -8}px, -50%)`,
            transition: "opacity .2s ease, transform .2s ease",
            pointerEvents: "none", display: { xs: "none", md: "block" },
            "&::after": {
              content: '""', position: "absolute", top: "50%", transform: "translateY(-50%)", borderStyle: "solid",
              ...(place.edge === "right"
                ? { left: "100%", borderWidth: "6px 0 6px 6px", borderColor: `transparent transparent transparent ${t.inverse}` }
                : { right: "100%", borderWidth: "6px 6px 6px 0", borderColor: `transparent ${t.inverse} transparent transparent` }),
            },
          }}>{chatLoading ? "Думаю…" : urgent ? `Есть новое: ${urgent}` : place.minimized ? "Напарник свёрнут — нажми, чтобы развернуть" : moodLabel(mood)}</Box>
        </Box>}
        <Menu open={Boolean(placement.menuAt)} onClose={placement.closeMenu} anchorReference="anchorPosition"
          anchorPosition={placement.menuAt ? { top: placement.menuAt.y, left: placement.menuAt.x } : undefined}>
          <MenuItem onClick={() => { placement.closeMenu(); placement.minimize(!place.minimized); }}>{place.minimized ? "Развернуть" : "Свернуть"}</MenuItem>
          <MenuItem onClick={() => { placement.closeMenu(); placement.hideForHour(); setSnack("Напарник скрыт на час. Вернуть — в меню профиля"); }}>Скрыть на час</MenuItem>
          <MenuItem onClick={() => { placement.closeMenu(); placement.reset(); }}>Вернуть в угол</MenuItem>
          <MenuItem onClick={() => { placement.closeMenu(); setSettingsOpen(true); }}>Настройки</MenuItem>
        </Menu>

        {(() => {
          const notesOpen = Boolean(notesAnchor);
          const closeNotes = () => setNotesAnchor(null);
          const notesList = notes.length ? notes.map((n) => (
            <Row
              key={n.id}
              align="flex-start"
              stackEndOnMobile
              title={n.text}
              sub={n.meta}
              onClick={() => { closeNotes(); nav(n.go); }}
              end={n.urgent ? <StatusTag status="Overdue" label="нужно действие" /> : undefined}
              sx={n.urgent ? { bgcolor: t.badSoft, "&:hover": { bgcolor: t.badSoft } } : undefined}
            />
          )) : (
            <Box sx={{ px: `${theme.space[4]}px` }}>
              <Empty text="Всё спокойно — новых событий нет." variant={2} />
            </Box>
          );
          // Мобилка: отдельный полноэкранный экран, как «Аккаунт» / «Мой профиль».
          if (mobile) {
            return (
              <Dialog
                open={notesOpen}
                onClose={closeNotes}
                fullScreen
                aria-labelledby="notes-title"
                slotProps={{ paper: { sx: { bgcolor: t.bg, boxShadow: "none" } } }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 2.5, pt: 2.5, pb: 1.5, flex: "none",
                    borderBottom: `1px solid ${t.line}`,
                    position: "sticky", top: 0, zIndex: 1, bgcolor: t.bg,
                  }}
                >
                  <Typography
                    id="notes-title"
                    component="h2"
                    fontWeight={theme.type.weight.semibold}
                    fontSize={theme.type.size.h2}
                    lineHeight={theme.type.line.snug}
                  >
                    Уведомления
                  </Typography>
                  <DialogClose onClose={closeNotes} />
                </Stack>
                <Box sx={{
                  flex: 1, overflowY: "auto",
                  py: 1,
                  pb: `max(24px, env(safe-area-inset-bottom))`,
                }}>
                  {notesList}
                </Box>
              </Dialog>
            );
          }
          return (
            <Popover
              open={notesOpen}
              anchorEl={notesAnchor}
              onClose={closeNotes}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              marginThreshold={16}
              slotProps={{ paper: { sx: {
                width: 360,
                maxHeight: 480,
                borderRadius: 0,
                border: `${theme.stroke.thick}px solid ${t.line}`,
                boxShadow: "none",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              } } }}
            >
              <Box sx={{ py: `${theme.space[2]}px`, overflowY: "auto", flex: 1, minHeight: 0 }}>
                <Typography
                  variant="h3"
                  component="h2"
                  sx={{
                    px: `${theme.space[4]}px`,
                    pt: `${theme.space[1]}px`,
                    pb: `${theme.space[2]}px`,
                    fontWeight: theme.type.weight.semibold,
                  }}
                >
                  Уведомления
                </Typography>
                {notesList}
              </Box>
            </Popover>
          );
        })()}

        {(() => {
          const accountOpen = Boolean(accountAnchor);
          const closeAccount = () => setAccountAnchor(null);
          const iconSx = { color: mode === "light" ? "#8B8C8B" : "rgba(243,243,243,0.55)", fontSize: 22 };
          const primarySx = { fontSize: 15, fontWeight: theme.type.weight.medium };
          const menuItemSx = { py: 1.25, px: 2, minHeight: 48, gap: 1.5, "&:hover": { bgcolor: t.surfaceHover } };

          // Десктоп: компактное меню у аватара.
          const desktopItems = <>
            {me && <MenuItem sx={menuItemSx} onClick={() => { closeAccount(); setProfileOf(""); }}>
              <AccountCircleOutlined sx={{ ...iconSx, mr: 0.5 }} />
              <ListItemText primary="Мой профиль" secondary="Фото, телефон, почта"
                slotProps={{ primary: { variant: "body1", sx: primarySx }, secondary: { variant: "body2" } }} />
            </MenuItem>}
            {me && placement.hidden && <MenuItem sx={menuItemSx} onClick={() => { closeAccount(); placement.show(); }}>
              <ListItemText primary="Показать Напарника" secondary="Он скрыт на час"
                slotProps={{ primary: { variant: "body1", sx: { fontSize: 14 } } }} />
            </MenuItem>}
            {me && <MenuItem sx={menuItemSx} onClick={() => { closeAccount(); setSettingsOpen(true); }}>
              <SettingsOutlined sx={{ ...iconSx, mr: 0.5 }} />
              <ListItemText
                primary="Настройки"
                secondary={role === "intern" ? "Подсказки, бадди, напоминания" : "Напоминания, «не беспокоить»"}
                slotProps={{ primary: { variant: "body1", sx: primarySx }, secondary: { variant: "body2" } }}
              />
            </MenuItem>}
            {me && <MenuItem sx={menuItemSx} onClick={() => { closeAccount(); setTgOpen(true); }}>
              <SendOutlined sx={{ ...iconSx, mr: 0.5 }} />
              <ListItemText primary="Уведомления в Telegram" secondary="Подключить или отключить бота"
                slotProps={{ primary: { variant: "body1", sx: primarySx }, secondary: { variant: "body2" } }} />
            </MenuItem>}
            {me && <Divider />}
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1.5, pb: 1, display: "block" }}>Тестовые учётки</Typography>
            {others.map((u) => (
              <MenuItem key={u.login} sx={menuItemSx} onClick={() => switchUser(u.login)}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: t.surface, color: t.text }}>{initials(u.name)}</Avatar>
                <ListItemText primary={u.name} secondary={`${ROLE_RU[primaryRole(u.roles)]} · ${u.position}`}
                  slotProps={{ primary: { variant: "body1", sx: primarySx }, secondary: { variant: "body2" } }} />
              </MenuItem>
            ))}
          </>;

          // Мобилка: полноэкранный экран аккаунта — как профиль/настройки, не «плавающий» диалог.
          if (mobile) {
            const action = (
              label: string,
              secondary: string,
              icon: ReactElement,
              onClick: () => void,
            ) => (
              <Box
                key={label}
                component="button"
                type="button"
                onClick={onClick}
                sx={{
                  all: "unset",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  width: "100%",
                  minHeight: 56,
                  px: 2,
                  py: 1.5,
                  bgcolor: t.surface,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                  "&:active": { bgcolor: t.surfaceHover },
                }}
              >
                <Box sx={{ display: "flex", color: mode === "light" ? "#8B8C8B" : "rgba(243,243,243,0.55)" }}>{icon}</Box>
                <Box minWidth={0} flex={1}>
                  <Typography fontWeight={theme.type.weight.medium} fontSize={15}>{label}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{secondary}</Typography>
                </Box>
              </Box>
            );

            return (
              <Dialog
                open={accountOpen}
                onClose={closeAccount}
                fullScreen
                aria-labelledby="account-title"
                slotProps={{ paper: { sx: { bgcolor: t.bg, boxShadow: "none" } } }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 2.5, pt: 2.5, pb: 1.5, flex: "none",
                    borderBottom: `1px solid ${t.line}`,
                    position: "sticky", top: 0, zIndex: 1, bgcolor: t.bg,
                  }}
                >
                  <Typography
                    id="account-title"
                    component="h2"
                    fontWeight={theme.type.weight.semibold}
                    fontSize={theme.type.size.h2}
                    lineHeight={theme.type.line.snug}
                  >
                    Аккаунт
                  </Typography>
                  <DialogClose onClose={closeAccount} />
                </Stack>

                <Box sx={{
                  flex: 1, overflowY: "auto",
                  px: 2, py: 2.5,
                  pb: `max(24px, env(safe-area-inset-bottom))`,
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  {me && (
                    <Stack direction="row" alignItems="center" gap={2} sx={{ px: 0.5 }}>
                      <ProfileAvatar login={login} photoUrl={myPhoto.login === login ? myPhoto.url : null} initials={initials(me.name)} size={56} />
                      <Box minWidth={0}>
                        <Typography fontWeight={theme.type.weight.semibold} fontSize={theme.type.size.h2} sx={{ textWrap: "balance" }}>
                          {me.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {role && ROLE_RU[role]} · демо
                        </Typography>
                      </Box>
                    </Stack>
                  )}

                  <Stack gap={1}>
                    {/* Профиль/настройки поверх аккаунта — назад возвращает сюда, аккаунт не закрываем. */}
                    {me && action("Мой профиль", "Фото, телефон, почта", <AccountCircleOutlined sx={{ fontSize: 22 }} />, () => setProfileOf(""))}
                    {me && placement.hidden && action("Показать Напарника", "Он скрыт на час", <VisibilityOutlined sx={{ fontSize: 22 }} />, () => { closeAccount(); placement.show(); })}
                    {me && action(
                      "Настройки",
                      role === "intern" ? "Подсказки, бадди, напоминания" : "Напоминания, «не беспокоить»",
                      <SettingsOutlined sx={{ fontSize: 22 }} />,
                      () => setSettingsOpen(true),
                    )}
                    {me && action("Уведомления в Telegram", "Подключить или отключить бота", <SendOutlined sx={{ fontSize: 22 }} />, () => setTgOpen(true))}
                  </Stack>

                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={theme.type.weight.semibold} sx={{ mb: 1, px: 0.5 }}>
                      Тестовые учётки
                    </Typography>
                    <Stack>
                      {others.map((u, i) => (
                        <Box
                          key={u.login}
                          component="button"
                          type="button"
                          onClick={() => switchUser(u.login)}
                          sx={{
                            all: "unset",
                            boxSizing: "border-box",
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            width: "100%",
                            minHeight: 56,
                            px: 2,
                            py: 1.25,
                            bgcolor: t.surface,
                            cursor: "pointer",
                            WebkitTapHighlightColor: "transparent",
                            borderBottom: i < others.length - 1 ? `1px solid ${t.line}` : "none",
                            "&:active": { bgcolor: t.surfaceHover },
                          }}
                        >
                          <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: t.bg, color: t.text, flex: "none" }}>{initials(u.name)}</Avatar>
                          <Box minWidth={0}>
                            <Typography fontWeight={theme.type.weight.medium} fontSize={15}>{u.name}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                              {ROLE_RU[primaryRole(u.roles)]} · {u.position}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Box>
              </Dialog>
            );
          }

          return (
            <Menu
              open={accountOpen}
              anchorEl={accountAnchor}
              onClose={closeAccount}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{ paper: { sx: { minWidth: 320, maxWidth: "calc(100vw - 24px)" } } }}
            >
              {desktopItems}
            </Menu>
          );
        })()}

        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} text={chatText} setText={setChatText} messages={messages} loading={chatLoading}
          onSend={(retry) => void sendChat(retry)} login={login} look={look} onAction={() => void load()} onReset={() => void newConversation()} />
        <ProfileDialog
          open={profileOf !== null}
          login={login}
          userId={profileOf || undefined}
          onClose={() => setProfileOf(null)}
          onBack={mobile && accountAnchor && profileOf === "" ? () => setProfileOf(null) : undefined}
          onChanged={(p) => { if (p.can_edit) setMyPhoto({ login, url: p.photo?.url ?? null }); }}
        />
        <TeamMapDialog open={teamOpen} login={login} onClose={() => setTeamOpen(false)} onProfile={setProfileOf}
          onOpenPage={(id) => { setTeamOpen(false); setKbOpen(id); nav("knowledge"); }} />
        <SettingsDialog
          open={settingsOpen}
          login={login}
          intern={role === "intern"}
          onClose={() => setSettingsOpen(false)}
          onBack={mobile && accountAnchor && settingsOpen ? () => setSettingsOpen(false) : undefined}
          onTelegram={() => { setSettingsOpen(false); setTgOpen(true); }}
        />
        <TelegramDialog
          open={tgOpen}
          login={login}
          onClose={() => setTgOpen(false)}
          onBack={mobile && accountAnchor && tgOpen ? () => setTgOpen(false) : undefined}
          onChange={setSnack}
        />
        <PlanDraftDialog open={Boolean(planDraftOf)} login={login} internId={planDraftOf} onClose={() => setPlanDraftOf("")}
          onDone={(m) => { setSnack(m); void load(); }} />
        <Snackbar
          open={Boolean(snack)}
          autoHideDuration={3000}
          onClose={() => setSnack("")}
          message={snack}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{
            bottom: { xs: 88, md: 24 },
            "& .MuiSnackbarContent-root": { width: "fit-content", minWidth: "unset", flexGrow: 0 },
          }}
        />
      </Box>
    </AppProviders>
  );
}

export default App;
