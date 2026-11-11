// Живая версия прототипа design1.html: 5 страниц, данные и чат — из Go-бэкенда (docs/spec/05-tools-api.md).
// Явный API-клиент (FE-03): все запросы идут через api(). Учётка — заголовок X-User (демо-переключатель ролей).
'use strict';

const $ = (id) => document.getElementById(id);
const state = { login: 'intern.sokolov', me: null, users: [], plan: null, questions: [], qFilter: '', kb: null, kbType: '', kbFolder: '', lastQuestion: '' };

try { state.login = localStorage.getItem('buddy.login') || state.login; } catch { /* приватный режим — не страшно */ }

// Один ключ на отправку формы; после сетевого сбоя повтор использует тот же ключ.
const requestKeys = new Map();
const pendingRequests = new Map();
async function api(method, path, body) {
  const login = state.login;
  const signature = method === 'POST' && path === '/api/requests' ? JSON.stringify([login, path, body]) : '';
  if (signature && pendingRequests.has(signature)) return pendingRequests.get(signature);
  const headers = { 'X-User': login, 'Content-Type': 'application/json' };
  if (signature) {
    if (!requestKeys.has(signature)) requestKeys.set(signature, crypto.randomUUID());
    headers['Idempotency-Key'] = requestKeys.get(signature);
  }
  const run = async () => {
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* пустой ответ */ }
    if (signature && res.status < 500) requestKeys.delete(signature);
    return { status: res.status, data };
  };
  const promise = run();
  if (signature) pendingRequests.set(signature, promise);
  try { return await promise; } finally { if (signature) pendingRequests.delete(signature); }
}

// Только textContent — никаких HTML-вставок из данных.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

const ruDate = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', opts);
const STATUS = {
  Overdue: ['red', 'Просрочен'], Today: ['blue', 'На сегодня'], Done: ['green', 'Готово'], Planned: ['', 'Запланирован'],
  pending: ['amber', 'На согласовании'], approved: ['green', 'Согласовано'], rejected: ['red', 'Отклонено'],
  granted: ['green', 'Выдан'], Sent: ['blue', 'Ждёт ответа'], Answered: ['green', 'Ответ готов'],
};
function badge(status) {
  const [color, text] = STATUS[status] || ['', status];
  return el('span', 'badge ' + color, text);
}
const initials = (name) => name.split(' ').slice(0, 2).map((w) => w[0]).join('');
const nameById = (id) => (state.users.find((u) => u.id === id) || {}).name || id;
const isIntern = () => state.me && state.me.roles.includes('intern');
const planOwner = () => (isIntern() ? state.me.id : (state.me.interns[0] || {}).id);

// ---------- навигация ----------

const PAGES = { day: 'мой день', plan: 'мой план', questions: 'вопросы', knowledge: 'база знаний', requests: 'заявки' };
function openPage(name) {
  if (!PAGES[name]) name = 'day';
  document.querySelectorAll('.page-view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  document.title = 'Напарник — ' + PAGES[name];
  history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- загрузка ----------

// ---------- всплывающее окно (из прототипа Павла; содержимое — DOM-узлы, без innerHTML из данных) ----------

function openModal(title, subtitle, body, actions = [{ label: 'Понятно', primary: true }]) {
  $('modalTitle').textContent = title;
  $('modalSubtitle').textContent = subtitle || '';
  $('modalBody').replaceChildren(...[].concat(body).filter(Boolean));
  $('modalActions').replaceChildren(...actions.map((a) => {
    const b = el('button', a.primary ? 'primary' : 'secondary', a.label);
    b.onclick = async () => { closeModal(); if (a.onClick) await a.onClick(); };
    return b;
  }));
  $('modalBackdrop').classList.add('open');
  $('modalBackdrop').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const first = $('modalActions').querySelector('button');
  if (first) first.focus();
}

function closeModal() {
  $('modalBackdrop').classList.remove('open');
  $('modalBackdrop').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function noteItem(icon, title, meta, unread) {
  const n = el('div', 'notification' + (unread ? ' unread' : ''));
  const body = el('div');
  body.append(el('b', '', title), el('div', 'meta', meta));
  n.append(el('span', '', icon), body);
  return n;
}

const ROLE_RU = { intern: 'Стажёр', buddy: 'Бадди', expert: 'Эксперт', lead: 'Руководитель' };
const roleText = (roles) => roles.map((r) => ROLE_RU[r] || r).join(', ');

async function loadUsers() {
  const { data } = await api('GET', '/api/users');
  state.users = data.users || [];
}

function openRoles() {
  const list = el('div', 'role-list');
  for (const u of state.users) {
    const r = el('div', 'role' + (u.login === state.login ? ' active' : ''));
    const body = el('div');
    body.append(el('b', '', u.name), el('div', 'meta', `${roleText(u.roles)} · ${u.position}`));
    r.append(el('span', 'avatar', initials(u.name)), body);
    r.tabIndex = 0;
    r.onclick = () => { closeModal(); switchUser(u.login); };
    list.appendChild(r);
  }
  openModal('Тестовые учётки', 'Переключение роли для демонстрации', list, [{ label: 'Закрыть', primary: true }]);
}

async function switchUser(login) {
  state.login = login;
  try { localStorage.setItem('buddy.login', login); } catch { /* не критично */ }
  document.querySelectorAll('#messages > :not(:first-child):not(#quick)').forEach((n) => n.remove());
  await api('POST', '/api/chat/reset'); // чат на экране пуст — и модель начинает разговор заново
  await loadAll();
  toast(`Вы вошли как ${state.me ? state.me.name : login}`);
}

async function loadAll() {
  const me = await api('GET', '/api/me');
  if (me.status !== 200) { $('hello').textContent = 'Не удалось войти — проверь, что сервер запущен'; return; }
  state.me = me.data;
  $('accAvatar').textContent = initials(state.me.name);
  $('accName').textContent = state.me.name;
  $('accRole').textContent = `${roleText(state.me.roles)} · демо`;
  $('date').textContent = ruDate(state.me.today);
  $('hello').textContent = `Доброе утро, ${state.me.name.split(' ')[0]}`;
  $('weekPill').replaceChildren(el('b', '', isIntern() ? `Неделя ${state.me.week}` : state.me.position), document.createTextNode(` · ${state.me.department}`));
  $('kbEyebrow').textContent = state.me.department;
  await Promise.all([renderToday(), loadPlan(), loadQuestions(), loadKB(), renderRequests()]);
  $('notifDot').hidden = notifications().length === 0;
}

// Уведомления — из настоящих данных: просрочки, заявки на согласовании, вопросы, события дня.
function notifications() {
  const out = [];
  const plan = state.plan && !state.plan.error ? state.plan : null;
  if (plan && isIntern()) {
    plan.steps.filter((s) => s.owner === 'intern' && s.status === 'Overdue')
      .forEach((s) => out.push(['!', `Просрочен шаг: ${s.title}`, 'Нужна помощь? Напарник подскажет', true]));
  }
  (state.requests || []).forEach((r) => {
    if (r.status === 'pending' && r.approver_id === state.me.id) out.push(['☂', `Ждёт решения: ${requestTitle(r)}`, `${r.id} · ${nameById(r.employee_id)}`, true]);
    else if (r.status === 'pending') out.push(['☂', `${requestTitle(r)} — на согласовании`, `${r.id} · ${nameById(r.approver_id)}`, false]);
    else if (r.employee_id === state.me.id) out.push(['✓', `Статус заявки ${r.id} изменился: ${STATUS[r.status][1].toLowerCase()}`, requestTitle(r), true]);
  });
  (state.questions || []).forEach((q) => {
    if (q.addressee_id === state.me.id && q.status === 'Sent') out.push(['✉', `Вам вопрос: ${questionTitle(q)}`, `от ${nameById(q.asked_by)}`, true]);
    else if (q.asked_by === state.me.id && q.status === 'Answered') out.push(['✓', `${q.addressee} ответил(а) на твой вопрос`, questionTitle(q), true]);
    else out.push(['✉', `Вопрос: ${q.addressee}`, STATUS[q.status] ? STATUS[q.status][1] : q.status, false]);
  });
  (state.drafts || []).forEach((p) => out.push(['✎', 'Проверь, я занёс твой ответ в базу', p.title, true]));
  (state.events || []).forEach((e) => out.push(['◷', `${e.start} · ${e.title}`, 'Сегодня', false]));
  return out;
}

function openNotifications() {
  const items = notifications();
  const list = el('div', 'notification-list');
  items.forEach(([icon, title, meta, unread]) => list.appendChild(noteItem(icon, title, meta, unread)));
  if (!items.length) list.appendChild(el('div', 'empty', 'Новых событий нет'));
  openModal('Уведомления', items.length ? `Событий: ${items.length}` : '', list, [{ label: 'Понятно', primary: true, onClick: () => { $('notifDot').hidden = true; } }]);
}

// ---------- Мой день ----------

async function renderToday() {
  const list = $('todayList');
  const box = $('events');
  list.replaceChildren();
  box.replaceChildren();
  $('todayCard').hidden = !isIntern();
  state.events = [];
  if (!isIntern()) {
    $('subtitle').textContent = 'Здесь видно прогресс стажёров и вопросы, адресованные тебе.';
    box.appendChild(el('div', 'empty', 'Событий на сегодня нет'));
    return;
  }
  const { data } = await api('GET', '/api/today');
  const steps = (data.data && data.data.steps) || [];
  const events = (data.data && data.data.events) || [];
  state.events = events;
  $('todayCount').textContent = steps.length;
  $('subtitle').textContent = `Сегодня шагов: ${steps.length}, встреч: ${events.length}. Начнём без спешки.`;
  if (!steps.length) list.appendChild(el('div', 'empty', 'На сегодня всё сделано'));
  for (const s of steps) {
    const row = el('div', 'task');
    const check = el('button', 'check', '✓');
    check.setAttribute('aria-label', 'Отметить шаг выполненным');
    check.onclick = () => markDone(s.id);
    const body = el('div');
    body.appendChild(el('div', 'task-title', s.title));
    const meta = el('div', 'meta');
    meta.append(el('span', '', `до ${ruDate(s.due_date, { day: 'numeric', month: 'long' })}`), badge(s.status));
    body.appendChild(meta);
    const access = s.title.toLowerCase().includes('доступ');
    const action = el('button', 'task-action', access ? 'Оформить' : 'Нужна помощь');
    action.onclick = () => openChat(access ? `Нужен доступ: ${s.title}` : `Помоги с шагом: ${s.title}`);
    row.append(check, body, action);
    list.appendChild(row);
  }
  if (!events.length) box.appendChild(el('div', 'empty', 'Событий на сегодня нет'));
  for (const e of events) {
    const ev = el('div', 'event');
    const right = el('div');
    right.append(el('div', 'event-title', e.title), el('div', 'event-sub', 'Сегодня'));
    const link = el('a', 'primary', 'Войти в Zoom');
    link.href = 'https://zoom.us/j/9001001002?pwd=demo';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'inline-flex';
    link.style.marginTop = '10px';
    right.appendChild(link);
    ev.append(el('div', 'event-time', e.start), right);
    box.appendChild(ev);
  }
}

async function markDone(stepId) {
  const { status, data } = await api('PATCH', `/api/plan-steps/${stepId}`, {});
  toast(status === 200 ? 'Шаг отмечен выполненным' : (data.error && data.error.message) || 'Не получилось');
  await Promise.all([renderToday(), loadPlan()]);
}

// ---------- План ----------

async function loadPlan() {
  const id = planOwner();
  state.plan = null;
  if (id) {
    const { status, data } = await api('GET', `/api/plans/${id}`);
    state.plan = status === 200 ? data.data : { error: (data.error && data.error.message) || 'План недоступен' };
  }
  renderProgressCard();
  renderPlanPage();
}

function stageStats(p) {
  const mine = p.steps.filter((s) => s.owner === 'intern');
  return p.stages.map((st) => {
    const steps = mine.filter((s) => s.stage === st.id);
    return { st, steps, done: steps.filter((s) => s.status === 'Done').length };
  });
}

function renderProgressCard() {
  const p = state.plan;
  $('progressCard').hidden = !p;
  $('stages').replaceChildren();
  $('stageLabels').replaceChildren();
  if (!p) return;
  $('progressTitle').textContent = isIntern() ? 'Путь адаптации' : `Путь адаптации: ${nameById(planOwner())}`;
  if (p.error) {
    $('progress').textContent = '—';
    $('progressMeta').textContent = p.error;
    $('nextStep').textContent = '';
    $('planBadge').textContent = '';
    return;
  }
  const mine = p.steps.filter((s) => s.owner === 'intern');
  const overdue = mine.some((s) => s.status === 'Overdue');
  $('progress').textContent = `${p.progress_pct}%`;
  $('progressMeta').textContent = `${mine.filter((s) => s.status === 'Done').length} из ${mine.length} шагов готовы`;
  $('nextStep').textContent = p.next_step ? `Следующий шаг: ${p.next_step.title}` : 'Все шаги пройдены';
  $('planBadge').className = 'badge ' + (overdue ? 'amber' : 'green');
  $('planBadge').textContent = overdue ? 'Есть просрочка' : 'В темпе';
  $('stages').style.gridTemplateColumns = `repeat(${p.stages.length}, 1fr)`;
  for (const { st, steps, done } of stageStats(p)) {
    const bar = el('div', 'stage' + (steps.length && done === steps.length ? ' complete' : ''));
    const fill = el('span');
    fill.style.width = steps.length ? `${Math.round((100 * done) / steps.length)}%` : '0%';
    bar.appendChild(fill);
    $('stages').appendChild(bar);
    $('stageLabels').appendChild(el('span', '', st.title.split(':')[0]));
  }
}

function renderPlanPage() {
  const p = state.plan;
  const box = $('planStages');
  box.replaceChildren();
  $('planH1').textContent = isIntern() ? 'Мой план' : `План: ${nameById(planOwner()) || '—'}`;
  $('planEyebrow').textContent = isIntern() ? `Неделя ${state.me.week}` : 'План стажёра';
  if (!p || p.error) {
    box.appendChild(el('div', 'empty', p ? p.error : 'Стажёров с планом нет'));
    $('planStatus').textContent = '';
    return;
  }
  $('planStatus').textContent = 'Утверждён';
  let currentFound = false;
  stageStats(p).forEach(({ st, steps, done }, i) => {
    const complete = steps.length && done === steps.length;
    const current = !complete && !currentFound;
    if (current) currentFound = true;
    const stage = el('div', 'plan-stage' + (complete ? ' complete' : current ? ' current' : ''));
    stage.append(el('span', 'plan-node', complete ? '✓' : String(i + 1)), el('h3', '', st.title),
      el('p', '', `${done} из ${steps.length} шагов`));
    const list = el('div', 'plan-steps');
    for (const s of steps) {
      const row = el('div', 'plan-step' + (s.status === 'Done' ? ' done-step' : ''));
      row.append(document.createTextNode(`${s.status === 'Done' ? '✓' : '○'} ${s.title}${s.source === 'demo-analytics' ? ' (демо)' : ''}`), badge(s.status));
      row.tabIndex = 0;
      row.onclick = () => openStep(s);
      list.appendChild(row);
    }
    stage.appendChild(list);
    box.appendChild(stage);
  });
  const mine = p.steps.filter((s) => s.owner === 'intern');
  const done = mine.filter((s) => s.status === 'Done').length;
  $('planProgress').textContent = `${p.progress_pct}%`;
  $('statDone').textContent = done;
  $('statLeft').textContent = mine.length - done;
  $('planNext').textContent = p.next_step ? p.next_step.title : 'Все шаги пройдены';
}

// Окно шага: «Нужна помощь» — в чат, «Отметить готовым» — настоящий PATCH (стажёр — свои шаги, бадди — своих стажёров).
function openStep(s) {
  const canMark = s.status !== 'Done' && (isIntern() || state.me.roles.includes('buddy'));
  const body = [el('p', '', `Срок: ${ruDate(s.due_date, { day: 'numeric', month: 'long' })}`), badge(s.status)];
  if (s.source === 'demo-analytics') body.push(el('p', '', 'Демо-шаг по образцу чек-листа Авито.'));
  const actions = [{ label: 'Нужна помощь', onClick: () => openChat(`Помоги с шагом: ${s.title}`) }];
  if (canMark) {
    actions.push({ label: 'Отметить готовым', primary: true, onClick: async () => {
      const { status, data } = await api('PATCH', `/api/plan-steps/${s.id}`, isIntern() ? {} : { intern_id: planOwner() });
      toast(status === 200 ? 'Шаг отмечен выполненным' : (data.error && data.error.message) || 'Не получилось');
      await Promise.all([renderToday(), loadPlan()]);
    } });
  }
  openModal('Шаг плана', s.title, body, actions);
}

// ---------- Вопросы ----------

async function loadQuestions() {
  const { data } = await api('GET', '/api/questions');
  state.questions = data.questions || [];
  state.teamCount = data.team_questions_count || 0;
  renderQuestions();
  await loadDrafts();
}

function questionText(q) { return q.text_hidden ? 'Текст скрыт настройками стажёра' : q.text; }
// Короткая суть для списков; полный вопрос — в карточке.
function questionTitle(q) { return q.text_hidden ? 'Текст скрыт настройками стажёра' : (q.title || q.text); }

function renderQuestions() {
  const qs = state.questions;
  const waiting = qs.filter((q) => q.status === 'Sent').length;
  $('qEyebrow').textContent = state.teamCount ? `Вопросов стажёров людям: ${state.teamCount}` : `${qs.length} всего · ${waiting} ждут ответа`;
  // карточка на «Мой день»
  const day = $('dayQuestions');
  day.replaceChildren();
  if (state.teamCount) day.appendChild(el('div', 'empty', `Вопросов стажёров людям: ${state.teamCount}. Тексты руководителю не показываются.`));
  else if (!qs.length) day.appendChild(el('div', 'empty', 'Вопросов людям пока нет'));
  for (const q of qs.slice(0, 3)) {
    const row = el('div', 'question');
    const body = el('div');
    const short = questionTitle(q).length > 90 ? questionTitle(q).slice(0, 90) + '…' : questionTitle(q);
    body.append(el('p', '', short), el('small', '', `${q.addressee}${q.urgent ? ' · срочно' : ''}`));
    row.append(body, badge(q.status));
    row.onclick = () => openQuestion(q);
    day.appendChild(row);
  }
  // таблица на странице «Вопросы»
  const search = $('qSearch').value.trim().toLowerCase();
  const rows = qs.filter((q) => (!state.qFilter || q.status === state.qFilter) && (!search || (questionTitle(q) + ' ' + questionText(q)).toLowerCase().includes(search)));
  const tbody = $('qTable');
  tbody.replaceChildren();
  for (const q of rows) {
    const tr = el('tr');
    const c1 = el('td');
    c1.append(el('div', 'table-title', questionTitle(q)), el('div', 'meta', q.urgent ? 'Срочно' : 'В сводке'));
    const person = (name) => { const td = el('td'); const p = el('div', 'person'); p.append(el('span', 'avatar', initials(name)), document.createTextNode(name)); td.appendChild(p); return td; };
    const c4 = el('td');
    c4.appendChild(badge(q.status));
    tr.append(c1, person(nameById(q.asked_by)), person(q.addressee), c4);
    tr.className = 'clickable';
    tr.onclick = () => openQuestion(q);
    tbody.appendChild(tr);
  }
  $('qEmpty').replaceChildren(rows.length ? '' : el('div', 'empty', state.teamCount ? 'Тексты вопросов руководителю не показываются.' : 'Вопросов нет. Спроси Напарника — если ответа нет в базе, он поможет написать нужному человеку.'));
}

// ---------- База знаний ----------

async function loadKB() {
  const { data } = await api('GET', '/api/kb/pages');
  state.kb = data;
  renderFolders();
  renderKB();
}

function renderFolders() {
  const box = $('folders');
  box.replaceChildren();
  const pages = state.kb.pages || [];
  const add = (id, title) => {
    const f = el('div', 'folder' + (state.kbFolder === id ? ' active' : ''));
    f.append(el('span', '', title), el('span', '', String(pages.filter((p) => !id || p.folder === id).length)));
    f.onclick = () => { state.kbFolder = id; renderFolders(); renderKB(); };
    box.appendChild(f);
  };
  add('', 'Все материалы');
  (state.kb.folders || []).forEach((f) => add(f.id, f.title));
}

const KB_ICON = { article: 'Doc', qa: 'Q', glossary: 'ABC' };

function renderKB() {
  const grid = $('kbGrid');
  grid.replaceChildren();
  const search = $('kbSearch').value.trim().toLowerCase();
  const pages = (state.kb.pages || []).filter((p) => (!state.kbType || p.type === state.kbType) && (!state.kbFolder || p.folder === state.kbFolder)
    && (!search || (p.title + ' ' + (p.body || p.excerpt)).toLowerCase().includes(search)));
  if (!pages.length) grid.appendChild(el('div', 'empty', 'Ничего не нашлось. Спроси Напарника — он поищет и подскажет, к кому идти.'));
  for (const p of pages) {
    const card = el('article', 'kb-card');
    card.tabIndex = 0;
    card.append(el('div', 'kb-icon', KB_ICON[p.type] || 'Doc'), el('h3', '', p.title), el('p', 'kb-excerpt', p.excerpt));
    const meta = el('div', 'meta');
    meta.appendChild(el('span', '', `${p.author} · ${ruDate(p.updated_at, { day: 'numeric', month: 'long', year: 'numeric' })}`));
    if (p.test_instruction) meta.appendChild(el('span', 'badge amber', 'Тестовая инструкция'));
    card.appendChild(meta);
    card.onclick = () => openModal(p.title, `${p.author} · обновлено ${ruDate(p.updated_at, { day: 'numeric', month: 'long', year: 'numeric' })}`,
      [p.test_instruction ? el('span', 'badge amber', 'Тестовая инструкция, не регламент Авито') : null, renderMarkdown(p.body || p.excerpt, 'kb-text md')],
      [{ label: 'Закрыть' }, { label: 'Спросить Напарника', primary: true, onClick: () => openChat(`Расскажи подробнее: ${p.title}`) }]);
    grid.appendChild(card);
  }
}

// ---------- Заявки ----------

const SYSTEMS = {};
const requestTitle = (r) => (r.kind === 'absence'
  ? `${(ABSENCE_TYPES[r.type] || 'Отгул')} · ${ruDate(r.date, { day: 'numeric', month: 'long' })}`
  : `Доступ: ${r.title || SYSTEMS[r.system] || r.system}`);
const ABSENCE_TYPES = { day_off: 'Отгул', vacation: 'Отпуск', sick_leave: 'Больничный' };
const COLUMNS = [
  ['pending', 'На согласовании'],
  ['done', 'Согласовано · выдан'],
  ['rejected', 'Отклонено'],
];
const column = (r) => (r.status === 'approved' || r.status === 'granted' ? 'done' : r.status);
const isApprover = (r) => r.approver_id === state.me.id;
const timeRu = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function loadServices() {
  const { data } = await api('GET', '/api/services');
  state.services = data;
  ((data.access && data.access.systems) || []).forEach((x) => { SYSTEMS[x.system] = x.title; });
}

async function renderRequests() {
  const [{ data }] = await Promise.all([api('GET', '/api/requests'), loadServices()]);
  const all = data.requests || [];
  state.requests = all;
  const rs = all.filter((r) => !state.reqKind || r.kind === state.reqKind);
  $('reqCount').textContent = all.length;
  // руководитель не подаёт заявки — он согласует
  $('reqActions').hidden = !isIntern();
  const waiting = all.filter((r) => isApprover(r) && r.status === 'pending').length;
  $('reqLead').textContent = isIntern()
    ? 'Отгулы и доступы: оформи сам или попроси Напарника. Согласует руководитель.'
    : 'Заявки стажёров, где ты согласующий. Решение сразу видно стажёру.';
  $('reqHint').textContent = waiting ? `Ждут твоего решения: ${waiting}` : '';
  const board = $('board');
  board.replaceChildren();
  for (const [key, title] of COLUMNS) {
    const items = rs.filter((r) => column(r) === key);
    const col = el('div', 'column');
    const head = el('div', 'column-head');
    head.append(el('span', '', title), el('span', 'count', String(items.length)));
    col.appendChild(head);
    items.forEach((r) => col.appendChild(ticketCard(r)));
    if (!items.length) col.appendChild(el('div', 'empty', key === 'pending' && isIntern() ? 'Пусто. «Оформить самому» или «Через Напарника»' : 'Пусто'));
    board.appendChild(col);
  }
}

function ticketCard(r) {
  const t = el('div', 'ticket');
  t.tabIndex = 0;
  const top = el('div', 'ticket-foot');
  top.append(el('span', 'ticket-key', r.id), el('span', 'source-tag' + (r.source === 'self' ? ' self' : ''), r.source === 'self' ? 'сам' : 'Напарник'));
  const foot = el('div', 'ticket-foot');
  const who = el('span', 'meta');
  who.append(el('span', 'avatar sm', initials(nameById(r.employee_id))), document.createTextNode(nameById(r.employee_id)));
  foot.append(who, badge(r.status));
  t.append(top, el('div', 'ticket-title', requestTitle(r)), foot);
  if (isApprover(r) && r.status === 'pending') {
    const acts = el('div', 'ticket-actions');
    const yes = el('button', 'primary', r.kind === 'access' ? 'Выдать' : 'Согласовать');
    const no = el('button', 'secondary', 'Отклонить');
    yes.onclick = (e) => { e.stopPropagation(); decide(r, 'approve'); };
    no.onclick = (e) => { e.stopPropagation(); openReject(r); };
    acts.append(yes, no);
    t.appendChild(acts);
  }
  t.onclick = () => openRequest(r);
  t.onkeydown = (e) => { if (e.key === 'Enter') openRequest(r); };
  return t;
}

function stepTitle(id) {
  const s = state.plan && state.plan.steps ? state.plan.steps.find((x) => x.id === id) : null;
  return s ? s.title : id;
}

function openRequest(r) {
  const fields = el('dl', 'fields');
  const add = (k, v) => { if (v) fields.append(el('dt', '', k), el('dd', '', v)); };
  add('Статус', (STATUS[r.status] || [, r.status])[1]);
  add('Автор', nameById(r.employee_id));
  add('Согласующий', nameById(r.approver_id));
  add('Как оформлена', r.source === 'self' ? 'Сам — в форме сервиса' : 'Напарник — черновик и подтверждение');
  add('Шаг плана', r.step_id ? stepTitle(r.step_id) : '');
  add(r.kind === 'access' ? 'Зачем' : 'Комментарий', r.comment);
  if (r.reason_code) {
    const codes = (state.services && state.services[r.kind] && state.services[r.kind].reason_codes) || [];
    add('Причина отказа', (codes.find((c) => c.code === r.reason_code) || {}).text || r.reason_code);
  }
  const hist = el('div', 'history');
  (r.history || []).forEach((h) => {
    const row = el('div');
    row.append(el('small', '', timeRu(h.at)), document.createTextNode(h.text));
    hist.appendChild(row);
  });
  const actions = [{ label: 'Закрыть' }];
  if (isApprover(r) && r.status === 'pending') {
    actions.push({ label: 'Отклонить', onClick: () => openReject(r) },
      { label: r.kind === 'access' ? 'Выдать доступ' : 'Согласовать', primary: true, onClick: () => decide(r, 'approve') });
  }
  // SC-27: доступ выдан → шаг плана предлагается отметить, стажёр подтверждает сам
  const step = r.step_id && state.plan && state.plan.steps ? state.plan.steps.find((x) => x.id === r.step_id) : null;
  if (r.employee_id === state.me.id && r.status === 'granted' && step && step.status !== 'Done') {
    actions.push({ label: 'Отметить шаг выполненным', primary: true, onClick: () => markDone(r.step_id) });
  }
  openModal(requestTitle(r), `${r.id} · создана ${timeRu(r.created_at)}`, [fields, el('b', '', 'История'), hist], actions);
}

async function decide(r, decision, reason, comment) {
  const { status, data } = await api('POST', `/api/requests/${r.id}/decision`, { decision, reason, comment });
  if (status !== 200) { toast((data.error && data.error.message) || 'Не получилось'); return; }
  toast(`${r.id}: ${STATUS[data.request.status][1].toLowerCase()} — ${nameById(r.employee_id)} увидит статус`);
  await renderRequests();
}

// Отказ — только с кодом причины из сервиса (reason_codes), «Другое» — с комментарием.
function openReject(r) {
  const codes = (state.services && state.services[r.kind] && state.services[r.kind].reason_codes) || [];
  const sel = el('select', 'field');
  codes.forEach((c) => { const o = el('option', '', c.text); o.value = c.code; sel.appendChild(o); });
  const note = el('textarea', 'field');
  note.placeholder = 'Комментарий стажёру (для «Другое» — обязательно)';
  openModal(`Отклонить ${r.id}`, requestTitle(r), [el('div', 'field-label', 'Причина'), sel, el('div', 'field-label', 'Комментарий'), note], [
    { label: 'Отмена' },
    { label: 'Отклонить', primary: true, onClick: () => decide(r, 'reject', sel.value, note.value) },
  ]);
}

// BR-42, «сделай сам»: форма сервиса без Напарника. Отправка формы — и есть подтверждение.
function openSelfService(kind = 'absence') {
  const svc = state.services || {};
  const seg = el('div', 'seg');
  [['absence', 'Отсутствие'], ['access', 'Доступ']].forEach(([k, label]) => {
    const b = el('button', 'filter' + (k === kind ? ' active' : ''), label);
    b.onclick = () => { closeModal(); openSelfService(k); };
    seg.appendChild(b);
  });
  const body = [seg];
  let submit;
  if (kind === 'absence') {
    const abs = svc.absence || {};
    const type = el('select', 'field');
    (abs.types || []).forEach((t) => { const o = el('option', '', t.title); o.value = t.type; type.appendChild(o); });
    const date = el('input', 'field');
    date.type = 'date';
    date.min = state.me.today;
    const warn = el('div');
    const comment = el('input', 'field');
    comment.placeholder = 'Необязательно';
    const check = async () => {
      warn.replaceChildren();
      if (!date.value) return;
      const { data } = await api('GET', `/api/services/absence/precheck?type=${encodeURIComponent(type.value)}&date=${encodeURIComponent(date.value)}`);
      ((data.data && data.data.warnings) || []).forEach((w) => warn.appendChild(el('div', 'warn', '⚠ ' + w.message)));
    };
    date.onchange = check;
    type.onchange = check;
    const steps = el('ol', 'meta');
    ((abs.self_service && abs.self_service.steps) || []).forEach((x) => steps.appendChild(el('li', '', x)));
    body.push(el('div', 'field-label', 'Тип'), type, el('div', 'field-label', 'Дата'), date, warn,
      el('div', 'field-label', 'Комментарий'), comment,
      el('p', 'meta', `Согласующий подставится сам: ${abs.approver || 'руководитель'}. Порядок — тестовая инструкция, не регламент Авито.`));
    submit = () => ({ kind, type: type.value, date: date.value, comment: comment.value });
  } else {
    const all = (svc.access && svc.access.systems) || [];
    const free = all.filter((x) => x.status === 'not_requested' || x.status === 'rejected');
    if (!free.length) {
      body.push(el('div', 'empty', 'Все доступы отдела уже запрошены или выданы.'));
    } else {
      const sys = el('select', 'field');
      [['Нужны сейчас', true], ['По плану позже', false]].forEach(([label, now]) => {
        const items = free.filter((x) => x.now === now);
        if (!items.length) return;
        const g = el('optgroup');
        g.label = label;
        items.forEach((x) => {
          const o = el('option', '', now ? x.title : `${x.title} — с ${x.week_from}-й недели`);
          o.value = x.system;
          g.appendChild(o);
        });
        sys.appendChild(g);
      });
      const hint = el('div');
      const showHint = () => {
        const x = free.find((s) => s.system === sys.value);
        hint.replaceChildren(x && !x.now ? el('div', 'warn', `⚠ По плану этот доступ нужен с ${x.week_from}-й недели. Руководитель может отклонить заявку как преждевременную.`) : '');
      };
      sys.onchange = showHint;
      showHint();
      const reason = el('input', 'field');
      reason.placeholder = 'Например: шаг плана — доступ к дашбордам отдела';
      body.push(el('div', 'field-label', 'Система'), sys, hint, el('div', 'field-label', 'Зачем'), reason);
      submit = () => ({ kind, system: sys.value, reason: reason.value || 'Шаг плана адаптации' });
    }
    const taken = all.filter((x) => x.status === 'granted' || x.status === 'pending');
    if (taken.length) {
      const list = el('div', 'access-list');
      taken.forEach((x) => { const row = el('div', 'meta'); row.append(badge(x.status), document.createTextNode(x.title)); list.appendChild(row); });
      body.push(el('div', 'field-label', 'Уже есть или на согласовании'), list);
    }
    body.push(el('p', 'meta', 'Показаны только системы твоего отдела. Системы с персональными данными стажёру не выдаются.'));
  }
  const actions = [{ label: 'Отмена' }];
  if (submit) actions.push({ label: 'Отправить в сервис', primary: true, onClick: () => sendSelf(submit()) });
  openModal('Оформить самому', 'Имитация корпоративного сервиса · демо', body, actions);
}

async function sendSelf(body) {
  if (body.kind === 'absence' && !body.date) { toast('Выбери дату'); openSelfService('absence'); return; }
  const { status, data } = await api('POST', '/api/requests', body);
  if (status !== 200) { toast((data.error && data.error.message) || 'Не получилось'); return; }
  toast(`Заявка ${data.data.id} отправлена: ${nameById(data.data.approver_id)}`);
  openPage('requests');
  await renderRequests();
}

function openQuestion(q) {
  const tip = el('div', 'tip');
  const p = el('p');
  p.append(el('b', '', 'Маршрут прозрачен'), document.createTextNode(`Вопрос направлен: ${q.addressee}. ${q.urgent ? 'Срочный — уходит сразу.' : 'Обычный — придёт адресату в сводке.'}`));
  tip.append(el('div', 'tip-icon', '↗'), p);
  const body = [badge(q.status)];
  if (!q.text_hidden && q.text && q.text !== q.title) body.push(renderMarkdown(q.text));
  if (q.reason) body.push(el('p', 'meta', `Почему выбран адресат: ${q.reason}`));
  if (q.answer) {
    const box = el('div', 'answer-box');
    box.append(el('b', '', `Ответ: ${q.addressee}`), el('p', '', q.answer));
    body.push(box);
  }
  body.push(tip);
  // P2, US-10: адресат отвечает текстом прямо в карточке
  if (q.addressee_id === state.me.id && q.status === 'Sent') {
    const area = el('textarea', 'field');
    area.placeholder = 'Ответ стажёру — я сразу передам его и оформлю страницу в базе знаний';
    body.push(el('div', 'field-label', 'Твой ответ'), area);
    openModal(questionTitle(q), `${nameById(q.asked_by)} → ${q.addressee}`, body, [
      { label: 'Закрыть' },
      { label: 'Ответить', primary: true, onClick: () => sendAnswer(q, area.value) },
    ]);
    setTimeout(() => area.focus(), 50);
    return;
  }
  openModal(questionTitle(q), `${nameById(q.asked_by)} → ${q.addressee}`, body);
}

async function sendAnswer(q, text) {
  if (!text.trim()) { toast('Напиши ответ'); return; }
  const { status, data } = await api('POST', `/api/questions/${q.id}/answer`, { text });
  toast(status === 200 ? 'Ответ отправлен. Черновик страницы ждёт проверки' : (data.error && data.error.message) || 'Не получилось');
  await loadQuestions();
}

// BR-30: страница публикуется только после «Ок» автора ответа; можно поправить заголовок и текст.
function openDraft(p) {
  const title = el('input', 'field');
  title.value = p.title;
  const text = el('textarea', 'field');
  text.value = p.body;
  const folder = ((state.kb && state.kb.folders) || []).find((f) => f.id === p.folder);
  const body = [
    el('p', '', 'Я оформил твой ответ страницей «Вопрос-ответ». Автор — ты. Опубликую после «Ок».'),
    el('div', 'field-label', 'Заголовок'), title,
    el('div', 'field-label', 'Текст'), text,
    el('p', 'meta', `Папка: ${folder ? folder.title : p.folder}`),
  ];
  if (p.similar_page_id) {
    const sim = ((state.kb && state.kb.pages) || []).find((x) => x.id === p.similar_page_id);
    const tip = el('div', 'tip');
    tip.append(el('div', 'tip-icon', '≈'), el('p', '', `Похожая страница: «${sim ? sim.title : p.similar_page_id}». Возможно, стоит дополнить её (BR-32).`));
    body.push(tip);
  }
  openModal('Проверь, я занёс твой ответ в базу', p.title, body, [
    { label: 'Позже' },
    { label: 'Ок, опубликовать', primary: true, onClick: async () => {
      const { status, data } = await api('POST', `/api/kb/pages/${p.id}/approve`, { title: title.value, body: text.value });
      toast(status === 200 ? 'Страница опубликована в базе знаний' : (data.error && data.error.message) || 'Не получилось');
      await Promise.all([loadQuestions(), loadKB()]);
    } },
  ]);
}

async function loadDrafts() {
  const { data } = await api('GET', '/api/kb/drafts');
  state.drafts = data.drafts || [];
  $('draftsCard').hidden = !state.drafts.length;
  $('draftCount').textContent = state.drafts.length;
  const list = $('draftList');
  list.replaceChildren();
  for (const p of state.drafts) {
    const row = el('div', 'request-card');
    const body = el('div');
    body.append(el('div', 'table-title', p.title), el('div', 'meta', 'Черновик страницы «Вопрос-ответ» из твоего ответа'));
    row.append(el('div', 'request-icon', '✎'), body, el('span', 'badge amber', 'Ждёт «Ок»'));
    row.onclick = () => openDraft(p);
    list.appendChild(row);
  }
}

// ---------- Чат ----------

const chat = $('chat');
function setChat(open) {
  chat.classList.toggle('open', open);
  chat.setAttribute('aria-hidden', String(!open));
  $('mascot').setAttribute('aria-expanded', String(open));
  if (open) $('chatText').focus();
}
function openChat(prefill) {
  setChat(true);
  if (prefill) $('chatText').value = prefill;
}

function addToChat(node) {
  $('messages').appendChild(node);
  $('messages').scrollTop = $('messages').scrollHeight;
  return node;
}

const draftTitle = (d) => ({
  create_absence_request: `Заявка на отгул: ${d.args.date}`,
  request_access: `Заявка на доступ: ${d.args.system}`,
  send_question: `Вопрос для ${nameById(d.args.addressee_id)}`,
  mark_step_done: `Отметить шаг ${d.args.step_id}`,
}[d.tool] || d.tool);

function renderDraft(d) {
  const box = el('div', 'draft');
  box.appendChild(el('b', '', '📝 ' + draftTitle(d)));
  if (d.tool === 'send_question') {
    box.appendChild(el('div', '', d.args.text));
    if (d.args.reason) box.appendChild(el('div', 'meta', `Почему: ${d.args.reason}`));
  }
  const row = el('div', 'row-btns');
  const ok = el('button', 'btn primary-sm', 'Подтвердить');
  const cancel = el('button', 'btn ghost', 'Отмена');
  ok.onclick = async () => {
    ok.disabled = true;
    const { status, data } = await api('POST', `/api/drafts/${d.id}/confirm`);
    if (status === 200) {
      const r = data.receipt || {};
      const status = (STATUS[r.status] || [])[1] || r.status;
      const parts = [r.id, status && status.toLowerCase(), r.approver, r.to && `${r.to}, ${r.delivery}`].filter(Boolean);
      box.replaceWith(el('div', 'receipt', '✅ Готово: ' + parts.join(' · ')));
      await Promise.all([renderRequests(), loadQuestions(), loadPlan()]);
    } else {
      ok.disabled = false;
      ok.textContent = status === 503 ? 'Повторить' : 'Подтвердить';
      addToChat(el('div', 'error', (data.error && data.error.message) || 'Не получилось'));
    }
  };
  cancel.onclick = () => box.replaceWith(el('div', 'empty', 'Черновик отменён — ничего не отправлено.'));
  row.append(ok, cancel);
  box.appendChild(row);
  return box;
}

// Ответ модели — с Markdown (**жирный**, `код`, списки, цитаты). Рисуем через DOM-узлы, без innerHTML:
// текст модели не может вставить в страницу свою разметку или скрипт.
function inlineMd(text) {
  const frag = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(m[1] !== undefined ? el('b', '', m[1]) : el('code', '', m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function renderMarkdown(text, cls = 'bubble bot md') {
  const box = el('div', cls);
  let list = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      const tag = /\d/.test(item[1]) ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = el(tag); box.appendChild(list); }
      const li = el('li');
      li.appendChild(inlineMd(item[2]));
      list.appendChild(li);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const quote = line.match(/^>\s?(.*)$/);
    const p = el(quote ? 'blockquote' : 'p');
    p.appendChild(inlineMd(quote ? quote[1] : line.replace(/^#{1,6}\s+/, '')));
    box.appendChild(p);
  }
  return box;
}

function renderSource(s) {
  const box = el('div', 'source');
  if (s.label) box.appendChild(el('span', 'badge amber', s.label));
  box.append(el('b', '', s.title), el('p', '', `${s.author} · обновлено ${s.updated_at}`));
  return box;
}

// BR-03: «помогло / не помогло / устарело». «Не помогло» сразу предлагает спросить человека.
// В прототипе отметки пока не сохраняются на сервере — это следующий шаг (метрики M-14…M-17).
function feedbackRow(question) {
  const row = el('div', 'quick');
  const mk = (label, onClick) => {
    const b = el('button', '', label);
    b.onclick = () => { row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); b.classList.add('active'); onClick(); };
    return b;
  };
  row.append(
    mk('Помогло', () => toast('Спасибо! Отметка учтена')),
    mk('Не помогло', () => ask(`Не помогло, нужен человек: ${question}`)),
    mk('Устарело', () => toast('Спасибо! Сообщу владельцу базы')),
  );
  return row;
}

function retryButton(text) {
  const row = el('div', 'row-btns');
  const retry = el('button', 'btn ghost', 'Повторить');
  retry.onclick = () => { row.remove(); ask(text); };
  row.appendChild(retry);
  return row;
}

async function ask(text) {
  state.lastQuestion = text;
  addToChat(el('div', 'bubble user', text));
  // BR-70: интерфейс не блокируется, пока модель думает; три точки — из прототипа Павла
  const thinking = addToChat(el('div', 'bubble bot thinking'));
  thinking.setAttribute('aria-label', 'Думаю');
  thinking.append(el('i'), el('i'), el('i'));
  let res;
  try { res = await api('POST', '/api/chat/messages', { text }); } catch { res = { status: 0, data: {} }; }
  thinking.remove();
  if (res.status !== 200) {
    addToChat(el('div', 'error', 'Сервер не ответил. Вопрос сохранён.'));
    addToChat(retryButton(text));
    return;
  }
  const r = res.data;
  addToChat(renderMarkdown(r.text));
  (r.sources || []).slice(0, 2).forEach((s) => addToChat(renderSource(s)));
  if ((r.sources || []).length) addToChat(feedbackRow(text));
  (r.drafts || []).forEach((d) => addToChat(renderDraft(d)));
  if (r.retry) addToChat(retryButton(text));
}

// ---------- события ----------

$('mascot').onclick = () => setChat(!chat.classList.contains('open'));
$('closeChat').onclick = () => setChat(false);
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatText').value.trim();
  if (!text) return;
  $('chatText').value = '';
  ask(text);
};
document.querySelectorAll('#quick button').forEach((b) => { b.onclick = () => ask(b.textContent); });
document.querySelectorAll('.nav button').forEach((b) => { b.onclick = () => openPage(b.dataset.page); });
document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openPage(b.dataset.open); });
document.querySelectorAll('[data-ask]').forEach((b) => { b.onclick = () => openChat(b.dataset.ask); });
$('selfService').onclick = () => openSelfService();
document.querySelectorAll('[data-rkind]').forEach((b) => {
  b.onclick = () => {
    state.reqKind = b.dataset.rkind;
    document.querySelectorAll('[data-rkind]').forEach((x) => x.classList.toggle('active', x === b));
    renderRequests();
  };
});
document.querySelectorAll('[data-qfilter]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('[data-qfilter]').forEach((x) => x.classList.toggle('active', x === b));
    state.qFilter = b.dataset.qfilter;
    renderQuestions();
  };
});
document.querySelectorAll('[data-kbtype]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('[data-kbtype]').forEach((x) => x.classList.toggle('active', x === b));
    state.kbType = b.dataset.kbtype;
    renderKB();
  };
});
$('qSearch').oninput = renderQuestions;
$('kbSearch').oninput = renderKB;
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').textContent = dark ? '☾' : '☼';
};
$('account').onclick = openRoles;
$('notifications').onclick = openNotifications;
$('modalClose').onclick = closeModal;
$('modalBackdrop').onclick = (e) => { if (e.target === $('modalBackdrop')) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); setChat(false); } });

openPage(location.hash.slice(1));
(async () => { await loadUsers(); await api('POST', '/api/chat/reset'); await loadAll(); })();
