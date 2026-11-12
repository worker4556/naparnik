// Чистые функции интерфейса: статусы, даты по-человечески, склонения, уведомления. Покрыты тестами.
import type { PlanStep, Question, RequestItem } from "@/shared/api";

export type Tone = "ok" | "bad" | "wait" | "today" | "neutral";

// Статус — всегда слово плюс цвет: смысл не передаётся только цветом.
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  Done: { label: "Готово", tone: "ok" },
  Today: { label: "На сегодня", tone: "today" },
  Planned: { label: "Впереди", tone: "neutral" },
  Overdue: { label: "Просрочено", tone: "bad" },
  pending: { label: "На согласовании", tone: "wait" },
  approved: { label: "Согласовано", tone: "ok" },
  granted: { label: "Доступ выдан", tone: "ok" },
  rejected: { label: "Отклонено", tone: "bad" },
  Sent: { label: "Ждёт ответа", tone: "wait" },
  Answered: { label: "Есть ответ", tone: "ok" },
  Draft: { label: "Черновик", tone: "neutral" },
};
export const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: "neutral" as Tone };

/** «шаг / шага / шагов» */
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const DAY_MS = 86_400_000;

/** Срок относительно «сегодня» демо: «сегодня», «завтра», «вчера», «чт, 19 ноября». */
export const relDay = (iso: string, today: string) => {
  const diff = Math.round((day(iso).getTime() - day(today).getTime()) / DAY_MS);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  return day(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
};

export const dueText = (step: PlanStep, today: string) =>
  step.status === "Done" ? "сделано" : step.due_date < today ? `срок был ${relDay(step.due_date, today)}` : `срок ${relDay(step.due_date, today)}`;

export const longDate = (iso: string) => day(iso).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
export const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const ABSENCE: Record<string, string> = { day_off: "Отгул", vacation: "Отпуск", sick_leave: "Больничный" };

export const requestTitle = (r: RequestItem) => r.kind === "absence"
  ? `${ABSENCE[r.type ?? ""] ?? "Отсутствие"}${r.date ? ` · ${day(r.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}`
  : `Доступ: ${r.title || r.system || "система"}`;

export const initials = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("");

export type Note = { id: string; text: string; meta: string; urgent: boolean; go: "day" | "questions" | "requests" | "knowledge" };

/** Уведомления — только из настоящих данных, по приоритету: что требует действия — выше. */
export const buildNotes = (p: {
  meId: string; today: string; steps: PlanStep[]; questions: Question[]; requests: RequestItem[]; drafts: Array<{ id: string; title: string }>;
  events: Array<{ title: string; start: string }>;
}): Note[] => {
  const out: Note[] = [];
  p.steps.filter((s) => s.status === "Overdue").forEach((s) =>
    out.push({ id: `o-${s.id}`, text: `Просрочен шаг: ${s.title}`, meta: dueText(s, p.today), urgent: true, go: "day" }));
  p.questions.filter((q) => q.addressee_id === p.meId && q.status === "Sent").forEach((q) =>
    out.push({ id: `in-${q.id}`, text: "Тебе вопрос", meta: q.text_hidden ? "текст скрыт" : q.title || q.text || "", urgent: true, go: "questions" }));
  p.drafts.forEach((d) =>
    out.push({ id: `d-${d.id}`, text: "Проверь, я занёс твой ответ в базу", meta: d.title, urgent: true, go: "questions" }));
  p.requests.filter((r) => r.status === "pending" && r.approver_id === p.meId).forEach((r) =>
    out.push({ id: `a-${r.id}`, text: `Ждёт решения: ${requestTitle(r)}`, meta: r.id, urgent: true, go: "requests" }));
  p.questions.filter((q) => q.asked_by === p.meId && q.status === "Answered").forEach((q) =>
    out.push({ id: `ans-${q.id}`, text: `${q.addressee} ответил(а)`, meta: q.title || "", urgent: false, go: "questions" }));
  p.requests.filter((r) => r.employee_id === p.meId && r.status !== "pending").forEach((r) =>
    out.push({ id: `r-${r.id}`, text: `${requestTitle(r)}: ${statusOf(r.status).label.toLowerCase()}`, meta: r.id, urgent: false, go: "requests" }));
  p.events.forEach((e) => out.push({ id: `e-${e.start}-${e.title}`, text: `${e.start} · ${e.title}`, meta: "сегодня", urgent: false, go: "day" }));
  return out;
};
