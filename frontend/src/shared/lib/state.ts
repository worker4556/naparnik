import type { KbDraft, KbFolder, KbPage, Me, PlanData, Question, RequestItem, Services, TeamOverview, TodayData, User } from "@/shared/api";

export type View = "day" | "plan" | "questions" | "knowledge" | "requests";
export type Role = "lead" | "buddy" | "intern" | "expert";

export type DataState = {
  me: Me;
  users: User[];
  plan?: PlanData;
  today?: TodayData;
  questions: Question[];
  requests: RequestItem[];
  pages: KbPage[];
  folders: KbFolder[];
  drafts: KbDraft[];
  overview?: TeamOverview;
  managedPlans: Array<{ id: string; name: string; plan?: PlanData }>;
  services?: Services;
};

export const primaryRole = (roles: string[]): Role =>
  roles.includes("lead") ? "lead" : roles.includes("buddy") ? "buddy" : roles.includes("intern") ? "intern" : "expert";

export const ROLE_RU: Record<Role, string> = { intern: "Стажёр", buddy: "Бадди", expert: "Эксперт", lead: "Руководитель" };

/** Подписи разделов зависят от роли: у каждой свой «главный экран». */
export const viewLabel = (role: Role, view: View) => {
  if (view === "day") return ({ lead: "Команда", buddy: "Мои стажёры", intern: "Мой день", expert: "Входящие" })[role];
  if (view === "plan") return role === "intern" ? "Мой план" : "Планы";
  if (view === "requests") return role === "lead" ? "Согласование" : "Заявки";
  if (view === "questions") return role === "intern" ? "Вопросы" : role === "buddy" ? "Вопросы стажёров" : "Вопросы мне";
  return "База знаний";
};

export const viewsFor = (role: Role): View[] => (["day", "plan", "questions", "knowledge", "requests"] as View[])
  .filter((v) => (v !== "plan" || role === "intern" || role === "buddy") && (v !== "requests" || role === "intern" || role === "lead")
    && !(role === "expert" && v === "questions"));
