export type User = {
  id: string;
  login: string;
  name: string;
  position: string;
  roles: string[];
};

export type Me = User & {
  week: number;
  today: string;
  department: string;
  interns: Array<{ id: string; name: string }>;
};

export type PlanStep = {
  id: string;
  title: string;
  stage: string;
  owner: string;
  due_date: string;
  status: "Planned" | "Today" | "Done" | "Overdue" | string;
  source: string;
};

export type PlanData = {
  intern: string;
  stages: Array<{ id: string; title: string; order: number }>;
  steps: PlanStep[];
  progress_pct: number;
  next_step?: PlanStep;
};

export type TodayData = {
  week: number;
  steps: PlanStep[];
  events: Array<{ title: string; start: string }>;
};

export type Question = {
  id: string;
  asked_by: string;
  addressee_id: string;
  addressee: string;
  title?: string;
  text?: string;
  text_hidden?: boolean;
  answer?: string;
  page_id?: string;
  reason?: string;
  urgent: boolean;
  status: string;
};

export type RequestItem = {
  id: string;
  kind: string;
  type?: string;
  date?: string;
  system?: string;
  title?: string;
  source?: string;
  comment?: string;
  step_id?: string;
  reason_code?: string;
  decision?: string;
  history?: Array<{ at: string; by: string; text: string }>;
  employee_id: string;
  approver_id: string;
  status: string;
  created_at: string;
};

export type InternOverview = {
  id: string; name: string; buddy: string; week: number; plan_status: string;
  stage: string; progress_pct: number; overdue_steps: number; open_questions: number;
};

export type TeamOverview = {
  department: string;
  interns: InternOverview[];
  requests: Array<{ id: string; kind: string; title: string; type?: string; date?: string;
    employee_id: string; employee_name: string; status: string }>;
  totals: { interns: number; overdue_steps: number; open_questions: number; pending_requests: number };
};

export type Services = {
  absence: { reason_codes: Array<{ code: string; text: string }>; types?: AbsenceType[]; approver?: string; self_service?: { steps: string[] } };
  access: { reason_codes: Array<{ code: string; text: string }>; systems?: SystemOption[] };
};

export type KbPage = {
  id: string;
  folder: string;
  type: string;
  title: string;
  excerpt: string;
  body?: string;
  author: string;
  updated_at: string;
  test_instruction: boolean;
};

export type KbDraft = { id: string; title: string; body: string; folder: string; similar_page_id?: string; source_question?: string };
export type AbsenceType = { type: string; title: string };
export type SystemOption = { system: string; title: string; status: string; week_from: number; now: boolean };
export type Warning = { code: string; message: string };
export type KbFolder = { id: string; title: string; space: string };

export type ChatReply = {
  text: string;
  drafts: Array<{ id: string; tool: string; args: Record<string, unknown> }>;
  sources: Array<{ page_id: string; title: string; author: string; updated_at: string; label?: string }>;
  degraded: boolean;
  retry: boolean;
};

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const requestKeys = new Map<string, string>();

export const api = async <T>(login: string, path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-User", login);
  const signature = init.method?.toUpperCase() === "POST" && path === "/api/requests"
    ? JSON.stringify([login, path, init.body]) : "";
  if (signature && !headers.has("Idempotency-Key")) {
    if (!requestKeys.has(signature)) requestKeys.set(signature, crypto.randomUUID());
    headers.set("Idempotency-Key", requestKeys.get(signature)!);
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (signature && response.status < 500) requestKeys.delete(signature);
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | T;
  if (!response.ok) {
    const envelope = payload as ApiEnvelope<T>;
    throw new ApiError(response.status, envelope.error?.message ?? "Не удалось выполнить запрос");
  }
  return payload as T;
};

export const unwrap = <T>(value: ApiEnvelope<T>): T => {
  if (!value.ok || value.data === undefined) throw new Error(value.error?.message ?? "Нет данных");
  return value.data;
};
