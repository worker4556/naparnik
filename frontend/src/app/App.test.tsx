// Интеграционные тесты приложения: весь интерфейс по ролям на настоящих ответах backend (src/test/fixtures.json).
// Проверяем пользовательский путь, а не разметку: что человек видит и какие запросы уходят на сервер.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatReply, mockApi, type Override } from "@/test/mockApi";
import fixtures from "@/test/fixtures.json";
import App from "./App";

const start = (login: string, override?: Override) => {
  localStorage.setItem("naparnik.login", login);
  localStorage.setItem("naparnik.theme", "light");
  const api = mockApi(override);
  render(<App />);
  return api;
};
const nav = (name: string) => within(screen.getByRole("navigation", { name: "Разделы" })).getByRole("button", { name });
const openChat = async () => userEvent.click(await screen.findByRole("button", { name: "Открыть чат с Напарником" }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("стажёр", () => {
  it("после перезагрузки остаётся в последнем разделе текущей учётной записи", async () => {
    localStorage.setItem("naparnik.login", "intern.sokolov");
    localStorage.setItem("naparnik.theme", "light");
    mockApi();
    const first = render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "База знаний" }));
    expect(await screen.findByRole("heading", { name: "База знаний" })).toBeInTheDocument();
    expect(localStorage.getItem("naparnik.view.intern.sokolov")).toBe("knowledge");

    first.unmount();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "База знаний" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Найти в базе команды")).toBeInTheDocument();
  });

  it("видит свой день, отмечает шаг и проходит по разделам", async () => {
    const api = start("intern.sokolov");
    expect(await screen.findByRole("heading", { name: /Даниил, на сегодня/ })).toBeInTheDocument();
    // «Мои вопросы» на «Моём дне»: вопросы людям и вопросы Напарнику из сохранённой истории
    expect(await screen.findByText("Что такое витрина объявлений?")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(() => expect(api.writesTo("/api/plan-steps/")).toHaveLength(1));
    expect(api.writesTo("/api/plan-steps/")[0]).toMatchObject({ method: "PATCH", body: { intern_id: "u-sokolov" } });
    expect(await screen.findByText("Шаг отмечен — так держать")).toBeInTheDocument();

    await userEvent.click(nav("Мой план"));
    expect(await screen.findByRole("heading", { name: "Мой план" })).toBeInTheDocument();

    await userEvent.click(nav("Вопросы"));
    expect(await screen.findByText("Спрашивал у Напарника")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Где взять шаблон презентации/ }));
    expect(screen.getByRole("button", { name: "Открыть чат" })).toBeInTheDocument();

    await userEvent.click(nav("База знаний"));
    const search = await screen.findByPlaceholderText("Найти в базе команды");
    await userEvent.type(search, "витрина");
    expect((await screen.findAllByText(/ads_mart/)).length).toBeGreaterThan(0);
  });

  it("оформляет отгул сам в форме сервиса и видит предупреждение по дате", async () => {
    const api = start("intern.sokolov");
    await userEvent.click(await screen.findByRole("button", { name: "Заявки" }));
    await userEvent.click(await screen.findByRole("button", { name: "Оформить самому" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Дата"), "2026-11-12");
    expect(await within(dialog).findByText("Меньше 2 рабочих дней до даты")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Отправить в сервис" }));
    await waitFor(() => expect(api.writesTo("/api/requests")).toHaveLength(1));
    expect(api.writesTo("/api/requests")[0].body).toMatchObject({ kind: "absence", type: "day_off", date: "2026-11-12" });
    expect(await screen.findByText("Заявка ABS-1100 отправлена на согласование")).toBeInTheDocument();
  });

  it("открывает карточку заявки с историей", async () => {
    start("intern.sokolov");
    await userEvent.click(await screen.findByRole("button", { name: "Заявки" }));
    await userEvent.click(await screen.findByText(/ABS-1042/));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("История")).toBeInTheDocument();
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Закрыть" }).at(-1)!);
  });

  it("в чате видит сохранённую историю, подтверждает черновик и начинает новый разговор", async () => {
    const api = start("intern.sokolov");
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await openChat();
    // История после перезагрузки: подтверждённый отгул — квитанцией, без второго «Подтвердить»
    expect(await screen.findByText(/Готово: ABS-1042/)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Спроси о команде или задачах"), "Нужен отгул в пятницу{Enter}");
    expect(await screen.findByText("Подготовил черновик — проверь и подтверди.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByText(/Готово: ABS-1099/)).toBeInTheDocument();
    expect(api.writesTo("/api/drafts/DRAFT-9/confirm")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Новый разговор" }));
    await waitFor(() => expect(api.writesTo("/api/chat/reset")).toHaveLength(1));
    expect(screen.queryByText(/Готово: ABS-1099/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Закрыть чат" }));
  });

  it("отменяет черновик — отмена сохраняется на сервере", async () => {
    const api = start("intern.sokolov");
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await openChat();
    await userEvent.type(screen.getByPlaceholderText("Спроси о команде или задачах"), "Нужен отгул{Enter}");
    await screen.findByText("Подготовил черновик — проверь и подтверди.");
    await userEvent.click(screen.getAllByRole("button", { name: "Отмена" }).at(-1)!);
    expect(await screen.findByText("Отменено — ничего не отправлено.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/drafts/DRAFT-9", body: { version: 1 } });
  });

  it("при сбое модели видит упрощённый режим и повторяет вопрос", async () => {
    let first = true;
    start("intern.sokolov", (c) => {
      if (c.path !== "/api/chat/messages") return undefined;
      if (first) { first = false; return { status: 500, body: { error: { message: "Модель не ответила" } } }; }
      return { body: { ...chatReply("Ответ после повтора"), drafts: [] } };
    });
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await openChat();
    await userEvent.type(screen.getByPlaceholderText("Спроси о команде или задачах"), "Что такое витрина?{Enter}");
    expect(await screen.findByText("Модель не ответила")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Ответ после повтора")).toBeInTheDocument();
  });

  it("открывает уведомления, свой профиль, меняет тему и переключает учётку", async () => {
    start("intern.sokolov");
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await userEvent.click(screen.getByRole("button", { name: /^Уведомления:/ }));
    expect(await screen.findByRole("heading", { name: "Уведомления" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Сменить тему" }));
    expect(localStorage.getItem("naparnik.theme")).toBe("dark");

    await userEvent.click(await screen.findByRole("button", { name: "Профиль и тестовые учётки" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Мой профиль/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(await screen.findByRole("button", { name: "Профиль и тестовые учётки" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Андрей Ковалёв/ }));
    expect(await screen.findByText("Стажёры")).toBeInTheDocument();
    expect(localStorage.getItem("naparnik.login")).toBe("lead.kovalev");
  });

  it("при ошибке загрузки показывает понятный текст и «Повторить»", async () => {
    let fail = true;
    start("intern.sokolov", (c) => (c.path === "/api/me" && fail ? { status: 500, body: { error: { message: "сервер недоступен" } } } : undefined));
    expect(await screen.findByText(/Не получилось загрузить данные: сервер недоступен/)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByRole("heading", { name: /Даниил, на сегодня/ })).toBeInTheDocument();
  });
});

describe("руководитель", () => {
  it("видит команду и согласует заявку", async () => {
    const api = start("lead.kovalev");
    expect(await screen.findByText("Стажёры")).toBeInTheDocument();
    expect(screen.getAllByText("Даниил Соколов").length).toBeGreaterThan(0);
    await userEvent.click(nav("Согласование"));
    await userEvent.click(await screen.findByRole("button", { name: "Согласовать" }));
    await waitFor(() => expect(api.writesTo("/api/requests/ABS-1042/decision")).toHaveLength(1));
    expect(api.writesTo("/api/requests/ABS-1042/decision")[0].body).toMatchObject({ decision: "approve" });
  });

  it("отклоняет заявку с причиной из справочника", async () => {
    const api = start("lead.kovalev");
    await screen.findByText("Стажёры");
    await userEvent.click(nav("Согласование"));
    await userEvent.click(await screen.findByRole("button", { name: "Отклонить" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click((await screen.findAllByRole("option"))[0]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(api.writesTo("/api/requests/ABS-1042/decision")).toHaveLength(1));
    expect(api.writesTo("/api/requests/ABS-1042/decision")[0].body).toMatchObject({ decision: "reject" });
  });
});

describe("бадди", () => {
  it("видит своих стажёров, открывает план стажёра и отвечает на вопрос", async () => {
    const api = start("buddy.belova");
    expect((await screen.findAllByText("Мои стажёры")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Открыть план" })[0]);
    expect(await screen.findByRole("heading", { name: /План: / })).toBeInTheDocument();
    expect(screen.getByLabelText("Стажёр")).toBeInTheDocument();

    await userEvent.click(nav("Вопросы стажёров"));
    const field = await screen.findByPlaceholderText("Напиши ответ своими словами");
    await userEvent.type(field, "Шаблон лежит в общей папке отдела.");
    await userEvent.click(screen.getByRole("button", { name: "Ответить" }));
    await waitFor(() => expect(api.writesTo("/api/questions/Q-102/answer")).toHaveLength(1));
  });
});

describe("эксперт", () => {
  it("проверяет и публикует страницу из своего ответа", async () => {
    const api = start("expert.smirnova");
    await userEvent.click(await screen.findByRole("button", { name: "Проверить" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Заголовок")).toHaveValue("Как выбрать длительность A/B-теста для низкого трафика?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ок, опубликовать" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "POST" && /\/api\/kb\/pages\/.+\/approve/.test(c.path))).toBe(true));
  });
});

// Телефон в тёмной теме: нижняя навигация, шторка чата снизу. Медиа-запросы «до ширины» срабатывают,
// «от ширины» — нет; тёмная тема — из системной настройки, пока человек не выбрал сам.
const phoneDark = () => vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
  matches: query.includes("max-width") || query.includes("dark"), media: query, onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
}));

describe("телефон, тёмная тема", () => {
  const startPhone = (login: string, override?: Override) => {
    phoneDark();
    localStorage.setItem("naparnik.login", login);
    const api = mockApi(override);
    render(<App />);
    return api;
  };

  it("стажёр ходит по нижней навигации, фильтрует вопросы и открывает страницу базы", async () => {
    startPhone("intern.sokolov");
    expect(await screen.findByRole("heading", { name: /Даниил, на сегодня/ })).toBeInTheDocument();
    expect(localStorage.getItem("naparnik.theme")).toBe("dark");
    const bottom = screen.getByRole("navigation", { name: "Разделы" });

    await userEvent.click(within(bottom).getByRole("button", { name: "Вопросы" }));
    await userEvent.click(await screen.findByRole("button", { name: /Ждут ответа/ }));
    expect(screen.getAllByText(/Где взять шаблон презентации/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Есть ответ/ }));
    await userEvent.type(screen.getByPlaceholderText("Найти вопрос"), "A/B");
    expect(screen.getAllByText(/длительность A\/B-теста/).length).toBeGreaterThan(0);

    await userEvent.click(within(bottom).getByRole("button", { name: "База знаний" }));
    const folders = await screen.findAllByRole("button", { pressed: false });
    await userEvent.click(folders[0]);
    await userEvent.type(screen.getByPlaceholderText("Найти в базе команды"), "Redash");
    await userEvent.click((await screen.findAllByText(/Redash/, { selector: "p, span, h3" }))[0]);
    const page = await screen.findByRole("dialog");
    await userEvent.click(within(page).getByRole("button", { name: "Спросить Напарника" }));
    expect(await screen.findByDisplayValue(/Расскажи подробнее/)).toBeInTheDocument();
  });

  it("стажёр запрашивает доступ в форме сервиса", async () => {
    const api = startPhone("intern.sokolov");
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Разделы" })).getByRole("button", { name: "Заявки" }));
    await userEvent.click(await screen.findByRole("button", { name: "Оформить самому" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Доступ" }));
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click((await screen.findAllByRole("option", { name: /по плану с/ }))[0]);
    expect(within(dialog).getByText(/руководитель может попросить подать позже/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Зачем"), "Шаг плана");
    await userEvent.click(within(dialog).getByRole("button", { name: "Отправить в сервис" }));
    await waitFor(() => expect(api.writesTo("/api/requests")).toHaveLength(1));
    expect(api.writesTo("/api/requests")[0].body).toMatchObject({ kind: "access", reason: "Шаг плана" });
  });

  it("форма заявки показывает ошибку сервиса", async () => {
    const api = startPhone("intern.sokolov", (c) => (c.method === "POST" && c.path === "/api/requests" ? { status: 503, body: { error: { message: "Сервис отсутствий недоступен" } } } : undefined));
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Разделы" })).getByRole("button", { name: "Заявки" }));
    await userEvent.click(await screen.findByRole("button", { name: "Оформить самому" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Дата"), "2026-11-20");
    await userEvent.click(within(dialog).getByRole("button", { name: "Отправить в сервис" }));
    await waitFor(() => expect(api.writesTo("/api/requests")).toHaveLength(1));
    // Ошибка сервиса остаётся на экране (раньше эффект формы сразу её стирал).
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Сервис отсутствий недоступен");
    await userEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
  });

  it("руководитель отклоняет с причиной «Другое» только с комментарием", async () => {
    const api = startPhone("lead.kovalev");
    await screen.findByText("Стажёры");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Разделы" })).getByRole("button", { name: "Согласование" }));
    await userEvent.click(await screen.findByRole("button", { name: "Отклонить" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click((await screen.findAllByRole("option")).at(-1)!);
    expect(within(dialog).getByText("Для «Другое» комментарий обязателен")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Отклонить" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Комментарий стажёру"), "Перенеси на понедельник");
    await userEvent.click(within(dialog).getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(api.writesTo("/api/requests/ABS-1042/decision")[0]?.body).toMatchObject({ decision: "reject", reason: "OTHER", comment: "Перенеси на понедельник" }));
  });

  it("бадди переключает стажёра в плане и открывает карточку стажёра", async () => {
    startPhone("buddy.belova");
    await screen.findAllByText("Мои стажёры");
    await userEvent.click(screen.getAllByRole("button", { name: "Открыть план" })[0]);
    await userEvent.click(await screen.findByLabelText("Стажёр"));
    await userEvent.click(await screen.findByRole("option", { name: "Полина Егорова" }));
    expect(await screen.findByRole("heading", { name: "План: Полина Егорова" })).toBeInTheDocument();
  });

  it("эксперт без вопросов видит пустые входящие и открывает чат", async () => {
    startPhone("expert.smirnova", (c) => (c.path === "/api/questions" ? { body: { questions: [] } } : c.path === "/api/kb/drafts" ? { body: { drafts: [] } } : undefined));
    expect(await screen.findByText("Здесь появятся вопросы, на которые ты ответил.")).toBeInTheDocument();
    await openChat();
    expect(await screen.findByPlaceholderText("Спроси о команде или задачах")).toBeInTheDocument();
  });
});

// Данные стажёра для ветвей интерфейса: решённые заявки в новостях, выданный доступ с шагом плана,
// просроченный вопрос и вопрос со скрытым текстом. Основа — настоящие ответы backend.
const fx = fixtures as Record<string, Record<string, unknown>>;
const intern = fx["intern.sokolov"];
const base = (intern["/api/requests"] as { requests: Array<Record<string, unknown>> }).requests[0];
const decided = { requests: [
  { ...base, id: "ABS-2001", status: "approved", decision: "Хорошего отдыха" },
  { ...base, id: "ABS-2002", status: "rejected", reason_code: "TOO_LATE", decision: "Подай раньше" },
  { ...base, id: "ACC-3001", kind: "access", type: undefined, system: "sys-redash", title: "Redash (дашборды отдела)", status: "granted", step_id: "s-04", source: "self", comment: "Шаг плана" },
] };
const plannedQuestions = { questions: [
  ...(intern["/api/questions"] as { questions: Array<Record<string, unknown>> }).questions.map((q) => (q.status === "Sent" ? { ...q, overdue: true, urgent: true } : q)),
  { id: "Q-900", asked_by: "u-sokolov", addressee_id: "u-orlov", addressee: "Михаил Орлов", status: "Sent", urgent: false, text_hidden: true, reason: "автор страниц про витрины" },
] };

describe("ветви интерфейса стажёра", () => {
  it("новости о решённых заявках, карточка выданного доступа отмечает шаг плана", async () => {
    const api = start("intern.sokolov", (c) => (c.method === "GET" && c.path === "/api/requests" ? { body: decided } : undefined));
    expect((await screen.findAllByText(/отклонен/i)).length).toBeGreaterThan(0);
    await userEvent.click(nav("Заявки"));
    await userEvent.click(await screen.findByText(/ACC-3001/));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Отметить шаг выполненным" }));
    await waitFor(() => expect(api.writesTo("/api/plan-steps/s-04")).toHaveLength(1));
    await userEvent.click(await screen.findByText(/ABS-2002/));
    expect(await screen.findByText("Подай раньше")).toBeInTheDocument();
  });

  it("просроченный и скрытый вопросы в «Вопросах»", async () => {
    start("intern.sokolov", (c) => (c.method === "GET" && c.path === "/api/questions" ? { body: plannedQuestions } : undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Вопросы" }));
    expect(await screen.findByText("Просрочен")).toBeInTheDocument();
    expect(screen.getByText("Текст скрыт настройками стажёра")).toBeInTheDocument();
  });

  it("новый стажёр без вопросов и заявок видит пустые состояния", async () => {
    start("intern.egorova");
    expect(await screen.findByText("Вопросов пока нет. Спроси Напарника — он сначала поищет в базе.")).toBeInTheDocument();
    expect(screen.getByText("Ответы людей и статусы заявок появятся здесь.")).toBeInTheDocument();
    await userEvent.click(nav("Заявки"));
    expect(await screen.findByText("Активных заявок нет.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Через Напарника" }));
    expect(await screen.findByDisplayValue(/Мне нужен отгул/)).toBeInTheDocument();
  });

  it("ответ Напарника с разметкой и черновиками разных действий; сбой подтверждения и повтор", async () => {
    let confirmFails = true;
    const reply = {
      text: "**Важно:** проверь `ads_mart`.\n- первый пункт\n- второй пункт\n1. шаг один\n2. шаг два\n> цитата из базы\n## Заголовок\n\nПоследняя строка",
      degraded: false, retry: false, sources: [],
      drafts: [
        { id: "D-ACC", tool: "request_access", args: { system: "sys-redash", reason: "Шаг плана" }, version: 1 },
        { id: "D-Q", tool: "send_question", args: { addressee_id: "u-orlov", reason: "Автор витрин", urgent: true, text: "Где **свежие** данные?" }, version: 1 },
        { id: "D-STEP", tool: "mark_step_done", args: { step_id: "s-04" }, version: 1 },
        { id: "D-X", tool: "unknown_tool", args: {}, version: 1 },
      ],
    };
    const api = start("intern.sokolov", (c) => {
      if (c.path === "/api/chat/messages") return { body: reply };
      if (c.path === "/api/drafts/D-ACC/confirm" && confirmFails) { confirmFails = false; return { status: 503, body: { error: { message: "Сервис доступов недоступен" } } }; }
      if (c.path === "/api/drafts/D-Q/confirm") return { status: 409, body: { error: { message: "Черновик изменился" } } };
      return undefined;
    });
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await openChat();
    await userEvent.type(screen.getByPlaceholderText("Спроси о команде или задачах"), "Помоги с доступом{Enter}");
    expect(await screen.findByText("Важно:")).toBeInTheDocument();
    expect(screen.getByText("ads_mart")).toBeInTheDocument();
    expect(screen.getByText("цитата из базы")).toBeInTheDocument();
    expect(screen.getByText("Заявка на доступ")).toBeInTheDocument();
    expect(screen.getByText("Вопрос: Михаил Орлов")).toBeInTheDocument();
    expect(screen.getByText("срочно — сразу")).toBeInTheDocument();
    expect(screen.getByText("Отметить шаг выполненным")).toBeInTheDocument();

    const confirms = screen.getAllByRole("button", { name: "Подтвердить" });
    await userEvent.click(confirms[0]);
    expect(await screen.findByText(/Сервис доступов недоступен/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText(/Готово: ABS-1099/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Подтвердить" })[0]);
    expect(await screen.findByText("Черновик изменился")).toBeInTheDocument();
    expect(api.writesTo("/api/drafts/D-ACC/confirm")).toHaveLength(2);
  });

  it("на широком экране в шапке имя и роль", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("min-width"), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    start("intern.sokolov");
    expect(await screen.findByText("Стажёр · демо")).toBeInTheDocument();
  });
});

describe("карта команды (SC-02)", () => {
  it("шаг «Познакомься с командой» открывает карту: бадди первым, страницы ведут в базу, черновик копируется", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const api = start("intern.sokolov");
    await userEvent.click(await screen.findByRole("button", { name: "Карта команды" }));
    const dialog = await screen.findByRole("dialog", { name: "Карта команды" });
    const cards = await within(dialog).findAllByRole("article");
    expect(cards[0]).toHaveAccessibleName("Екатерина Белова");
    expect(within(cards[0]).getByText("твой бадди")).toBeInTheDocument();
    // Топ-руководитель — без «Написать», вопросы через бадди (BR-10a)
    const director = cards.find((c) => c.getAttribute("aria-label") === "Сергей Волков")!;
    expect(within(director).queryByRole("button", { name: "Написать" })).not.toBeInTheDocument();
    expect(within(director).getByText("Вопросы по этим темам — через бадди.")).toBeInTheDocument();

    await userEvent.click(within(cards[0]).getByRole("button", { name: "Написать" }));
    const draft = within(cards[0]).getByRole("textbox", { name: "Черновик сообщения" }) as HTMLTextAreaElement;
    expect(draft.value).toContain("Ты мой бадди");
    await userEvent.click(within(cards[0]).getByRole("button", { name: "Скопировать" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Привет, Екатерина!"));
    expect(within(cards[0]).getByRole("status")).toHaveTextContent("отправь сам");
    // Ничего не ушло на сервер от имени стажёра (BR-62)
    expect(api.calls.filter((c) => c.method !== "GET" && c.path !== "/api/practices/sync")).toHaveLength(0);

    await userEvent.click(within(cards[0]).getByRole("button", { name: /Первая неделя стажёра-аналитика/ }));
    expect(await screen.findByRole("dialog", { name: /Первая неделя стажёра-аналитика/ })).toBeInTheDocument();
    const sections = screen.getByRole("navigation", { name: "Разделы", hidden: true });
    expect(within(sections).getByRole("button", { name: "База знаний", hidden: true })).toHaveAttribute("aria-current", "page");
  });

  it("копирование не удалось — подсказка скопировать вручную; ошибка загрузки карты видна", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("нет доступа")) }, configurable: true });
    let fail = false;
    start("intern.sokolov", (c) => (c.path === "/api/team" && fail ? { status: 503, body: { error: { message: "Справочник недоступен" } } } : undefined));
    await screen.findByRole("heading", { name: /Даниил, на сегодня/ });
    await userEvent.click(nav("Мой план"));
    await userEvent.click(await screen.findByRole("button", { name: "Карта команды" }));
    const dialog = await screen.findByRole("dialog", { name: "Карта команды" });
    const card = (await within(dialog).findAllByRole("article"))[1];
    await userEvent.click(within(card).getByRole("button", { name: "Написать" }));
    await userEvent.clear(within(card).getByRole("textbox", { name: "Черновик сообщения" }));
    expect(within(card).getByRole("button", { name: "Скопировать" })).toBeDisabled();
    await userEvent.type(within(card).getByRole("textbox", { name: "Черновик сообщения" }), "Привет!");
    await userEvent.click(within(card).getByRole("button", { name: "Скопировать" }));
    expect(within(card).getByRole("status")).toHaveTextContent("скопируй вручную");
    await userEvent.click(within(card).getByRole("button", { name: "Свернуть" }));
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Закрыть" }).at(-1)!);

    fail = true;
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: "Карта команды" }));
    expect(await screen.findByText("Справочник недоступен")).toBeInTheDocument();
  });
});
