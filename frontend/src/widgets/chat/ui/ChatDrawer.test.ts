import { describe, expect, it } from "vitest";
import { describeDraft, type Lookup } from "./ChatDrawer";

const look: Lookup = {
  userName: (id) => ({ "u-orlov": "Михаил Орлов" })[id] ?? id,
  systemTitle: (id) => ({ "sys-redash": "Redash (дашборды)" })[id] ?? id,
  stepTitle: (id) => ({ "s-04": "Запроси доступ к Redash" })[id] ?? id,
};

// BR-14: в черновике видно, что именно уйдёт, а не имя инструмента.
describe("describeDraft", () => {
  it("отгул — тип и дата по-русски", () => {
    const v = describeDraft({ id: "DRAFT-1", tool: "create_absence_request", args: { type: "day_off", date: "2026-11-16" } }, look);
    expect(v.title).toContain("Отгул");
    expect(v.rows[0][1]).toContain("16 ноября");
    expect(JSON.stringify(v)).not.toContain("create_absence_request");
  });
  it("доступ — название системы вместо id", () => {
    const v = describeDraft({ id: "DRAFT-2", tool: "request_access", args: { system: "sys-redash", reason: "шаг плана" } }, look);
    expect(v.rows).toContainEqual(["Система", "Redash (дашборды)"]);
  });
  it("вопрос — адресат, срочность и полный текст", () => {
    const v = describeDraft({ id: "DRAFT-3", tool: "send_question", args: { addressee_id: "u-orlov", text: "Почему расходится?", urgent: true } }, look);
    expect(v.title).toBe("Вопрос: Михаил Орлов");
    expect(v.text).toBe("Почему расходится?");
    expect(v.rows).toContainEqual(["Срочность", "срочно — сразу"]);
  });
  it("шаг плана и неизвестное действие", () => {
    expect(describeDraft({ id: "D", tool: "mark_step_done", args: { step_id: "s-04" } }, look).rows[0][1]).toBe("Запроси доступ к Redash");
    expect(describeDraft({ id: "D", tool: "other", args: {} }, look).title).toBe("Действие");
  });
});
