// Заявки в имитации корпоративного сервиса. Два пути (BR-42): «сделай сам» — форма, «сделаю за тебя» — Напарник.
// Руководитель согласует или отклоняет с причиной из справочника сервиса.
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { api, unwrap, type RequestItem, type Warning } from "@/shared/api";
import { requestTitle, shortDateTime } from "@/shared/lib";
import type { DataState } from "@/shared/lib";
import { AiTag, Block, Empty, PageHead, Row, StatusTag } from "@/shared/ui";

type Kind = "absence" | "access";

const SelfServiceDialog = ({ open, data, login, onClose, onSent }: { open: boolean; data: DataState; login: string; onClose: () => void; onSent: (msg: string) => void }) => {
  const mobile = useMediaQuery(useTheme().breakpoints.down("sm"));
  const { t } = useTheme();
  const abs = data.services?.absence;
  const systems = (data.services?.access.systems ?? []).filter((s) => s.status === "not_requested" || s.status === "rejected");
  const [kind, setKind] = useState<Kind>("absence");
  const [type, setType] = useState("day_off");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const [system, setSystem] = useState("");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = systems.find((s) => s.system === system);

  useEffect(() => { if (open) { setError(""); setSystem((s) => s || systems[0]?.system || ""); } }, [open, systems]);
  useEffect(() => {
    if (kind !== "absence" || !date) { setWarnings([]); return; }
    const c = new AbortController();
    api<{ ok: boolean; data: { warnings: Warning[] | null } }>(login, `/api/services/absence/precheck?type=${encodeURIComponent(type)}&date=${encodeURIComponent(date)}`, { signal: c.signal })
      .then((r) => setWarnings(unwrap(r).warnings ?? [])).catch(() => undefined);
    return () => c.abort();
  }, [kind, type, date, login]);

  const send = async () => {
    setBusy(true); setError("");
    try {
      const body = kind === "absence" ? { kind, type, date, comment } : { kind, system, reason: comment || "Шаг плана адаптации" };
      const res = await api<{ data: RequestItem }>(login, "/api/requests", { method: "POST", body: JSON.stringify(body) });
      onSent(`Заявка ${res.data.id} отправлена на согласование`);
      setDate(""); setComment("");
    } catch (e) { setError(e instanceof Error ? e.message : "Не получилось отправить"); }
    setBusy(false);
  };

  const tab = (k: Kind, label: string) => <Box component="button" onClick={() => setKind(k)} aria-pressed={kind === k} sx={{
    font: "inherit", border: "none", px: 2, py: 1, flex: 1, fontWeight: 600, bgcolor: kind === k ? t.inverse : t.surface, color: kind === k ? t.onInverse : t.text,
  }}>{label}</Box>;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={mobile}>
      <DialogTitle>Оформить самому</DialogTitle>
      <DialogContent>
        <Stack direction="row" mb={2.5}>{tab("absence", "Отсутствие")}{tab("access", "Доступ")}</Stack>
        {kind === "absence" ? <Stack gap={2}>
          <TextField select label="Тип" value={type} onChange={(e) => setType(e.target.value)}>
            {(abs?.types ?? [{ type: "day_off", title: "Отгул" }]).map((x) => <MenuItem key={x.type} value={x.type}>{x.title}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Дата" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: data.me.today } }} />
          {warnings.map((w) => <Box key={w.code} sx={{ bgcolor: t.badSoft, px: 1.5, py: 1, fontSize: 14 }}>{w.message}</Box>)}
          <TextField label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
          <Typography variant="body2" color="text.secondary">Согласует {abs?.approver ?? "руководитель"} — подставится сам. Порядок — тестовая инструкция, не регламент Авито.</Typography>
        </Stack> : systems.length ? <Stack gap={2}>
          <TextField select label="Система" value={system} onChange={(e) => setSystem(e.target.value)}>
            {systems.map((s) => <MenuItem key={s.system} value={s.system}>{s.title}{s.now ? "" : ` — по плану с ${s.week_from}-й недели`}</MenuItem>)}
          </TextField>
          {chosen && !chosen.now && <Box sx={{ bgcolor: t.waitSoft, px: 1.5, py: 1, fontSize: 14 }}>По плану этот доступ нужен с {chosen.week_from}-й недели — руководитель может попросить подать позже.</Box>}
          <TextField label="Зачем" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: шаг плана — дашборды отдела" />
          <Typography variant="body2" color="text.secondary">Здесь только системы твоего отдела. Доступы к персональным данным стажёрам не выдаются.</Typography>
        </Stack> : <Empty text="Все доступы отдела уже запрошены или выданы." variant={2} />}
        {error && <Typography color="error.main" mt={2} role="alert">{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button variant="text" onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={busy || (kind === "absence" ? !date : !system)} onClick={() => void send()}>{busy ? "Отправляю…" : "Отправить в сервис"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const RejectDialog = ({ request, data, onClose, onReject }: { request: RequestItem | null; data: DataState; onClose: () => void; onReject: (r: RequestItem, reason: string, comment: string) => void }) => {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const codes = request?.kind === "access" ? data.services?.access.reason_codes : data.services?.absence.reason_codes;
  return (
    <Dialog open={Boolean(request)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Отклонить: {request && requestTitle(request)}</DialogTitle>
      <DialogContent><Stack gap={2} pt={1}>
        <TextField select label="Причина" value={reason} onChange={(e) => setReason(e.target.value)}>{codes?.map((c) => <MenuItem key={c.code} value={c.code}>{c.text}</MenuItem>)}</TextField>
        <TextField label="Комментарий стажёру" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} helperText={reason === "OTHER" ? "Для «Другое» комментарий обязателен" : "Необязательно"} />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button variant="text" onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={!reason || (reason === "OTHER" && !comment.trim())} onClick={() => request && onReject(request, reason, comment.trim())}>Отклонить</Button>
      </DialogActions>
    </Dialog>
  );
};

/** Карточка заявки (SCR-I7): квитанция и история статусов, как журнал в трекере. */
const RequestDialog = ({ request, data, onClose, onMarkStep }: { request: RequestItem | null; data: DataState; onClose: () => void; onMarkStep?: (stepId: string) => void }) => {
  const { t } = useTheme();
  if (!request) return null;
  const name = (id: string) => data.users.find((u) => u.id === id)?.name ?? id;
  const step = request.step_id ? data.plan?.steps.find((s) => s.id === request.step_id) : undefined;
  const codes = request.kind === "access" ? data.services?.access.reason_codes : data.services?.absence.reason_codes;
  const fields: Array<[string, string | undefined]> = [
    ["Номер", request.id], ["Автор", name(request.employee_id)], ["Согласует", name(request.approver_id)],
    ["Как оформлена", request.source === "self" ? "сам, в форме сервиса" : "через Напарника"],
    ["Шаг плана", step?.title], [request.kind === "access" ? "Зачем" : "Комментарий", request.comment],
    ["Причина отказа", request.reason_code ? codes?.find((c) => c.code === request.reason_code)?.text ?? request.reason_code : undefined],
    ["Комментарий согласующего", request.decision],
  ];
  const canMark = onMarkStep && request.status === "granted" && step && step.status !== "Done";
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>{requestTitle(request)}</DialogTitle>
      <DialogContent>
        <Box mb={2}><StatusTag status={request.status} /></Box>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", m: 0, mb: 3 }}>
          {fields.filter(([, v]) => v).map(([k, v]) => [<Typography key={`${k}-k`} component="dt" color="text.secondary">{k}</Typography>, <Typography key={`${k}-v`} component="dd" sx={{ m: 0 }}>{v}</Typography>])}
        </Box>
        <Typography variant="h3" component="h3" mb={1}>История</Typography>
        <Box sx={{ borderLeft: `2px solid ${t.line}`, pl: 2 }}>
          {(request.history ?? []).map((h, i) => <Box key={i} mb={1.25}>
            <Typography variant="caption" color="text.secondary">{shortDateTime(h.at)}</Typography>
            <Typography variant="body2">{h.text}</Typography>
          </Box>)}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button variant={canMark ? "text" : "contained"} onClick={onClose}>Закрыть</Button>
        {canMark && <Button variant="contained" onClick={() => { onMarkStep(step.id); onClose(); }}>Отметить шаг выполненным</Button>}
      </DialogActions>
    </Dialog>
  );
};

export const RequestsPage = ({ data, login, isLead, busy, onAgent, onDecide, onSent, onMarkStep }: {
  data: DataState; login: string; isLead: boolean; busy: boolean; onAgent: () => void; onMarkStep?: (stepId: string) => void;
  onDecide: (r: RequestItem, decision: "approve" | "reject", reason?: string, comment?: string) => Promise<void>; onSent: (msg: string) => void;
}) => {
  const [form, setForm] = useState(false);
  const [rejecting, setRejecting] = useState<RequestItem | null>(null);
  const [opened, setOpened] = useState<RequestItem | null>(null);
  const name = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Стажёр";
  const { t } = useTheme();
  const pending = data.requests.filter((r) => r.status === "pending");
  const done = data.requests.filter((r) => r.status !== "pending");
  const hasAny = pending.length + done.length > 0;
  // Два пути (BR-42), не сегмент: primary = форма, secondary = Напарник. Одна точка входа — шапка или empty.
  const actions = (
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button variant="contained" onClick={() => setForm(true)}>Оформить самому</Button>
      {/* Secondary CTA той же высоты: без вложенного AiTag — тег внутри кнопки ломал читаемость */}
      <Button variant="outlined" onClick={onAgent}>Через Напарника</Button>
    </Stack>
  );
  const row = (r: RequestItem) => <Row key={r.id} title={requestTitle(r)} onClick={() => setOpened(r)}
    sub={<>{isLead ? `${name(r.employee_id)} · ` : ""}{r.id} · {shortDateTime(r.created_at)} · {r.source === "self" ? "оформлена сам" : <AiTag>через Напарника</AiTag>}</>}
    end={isLead && r.status === "pending" && r.approver_id === data.me.id ? <>
      <Button variant="contained" size="small" disabled={busy} sx={{ minHeight: 36 }} onClick={(e) => { e.stopPropagation(); void onDecide(r, "approve"); }}>{r.kind === "access" ? "Выдать" : "Согласовать"}</Button>
      <Button variant="text" size="small" disabled={busy} sx={{ minHeight: 36, bgcolor: "transparent", "&:hover": { bgcolor: t.surfaceHover } }} onClick={(e) => { e.stopPropagation(); setRejecting(r); }}>Отклонить</Button>
    </> : <StatusTag status={r.status} />} />;
  return <>
    <PageHead context={isLead ? (pending.length ? `Ждут твоего решения: ${pending.length}` : "Новых заявок нет") : "Отгулы и доступы через сервисы отдела"}
      title={isLead ? "Согласование" : "Заявки"}
      action={!isLead && hasAny ? actions : undefined} />
    <Stack gap={5}>
      <Block title="На согласовании" aside={pending.length > 0 ? <Typography color="text.secondary">{pending.length}</Typography> : undefined}>
        {pending.length ? pending.map(row) : (
          <Empty
            text={isLead ? "Решать сейчас нечего." : hasAny ? "Сейчас на согласовании ничего нет." : "Активных заявок нет."}
            action={!isLead && !hasAny ? actions : undefined}
          />
        )}
      </Block>
      {done.length > 0 && <Block title="Решено">{done.map(row)}</Block>}
    </Stack>
    {!isLead && <SelfServiceDialog open={form} data={data} login={login} onClose={() => setForm(false)} onSent={(m) => { setForm(false); onSent(m); }} />}
    <RequestDialog request={opened} data={data} onClose={() => setOpened(null)} onMarkStep={onMarkStep} />
    <RejectDialog request={rejecting} data={data} onClose={() => setRejecting(null)} onReject={async (r, reason, comment) => { setRejecting(null); await onDecide(r, "reject", reason, comment); }} />
  </>;
};
