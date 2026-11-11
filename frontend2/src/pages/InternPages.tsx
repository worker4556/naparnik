// Стажёр: «Мой день» и «Мой план». Главное за 3 секунды — сколько шагов сегодня и что горит.
import type { ReactNode } from "react";
import { Box, Button, Checkbox, Stack, Typography, useTheme } from "@mui/material";
import { brand } from "../theme";
import type { PlanData, PlanStep } from "../api";
import { dueText, longDate, plural } from "../helpers";
import type { DataState } from "../state";
import { Block, Empty, PageHead, Row, StatusTag } from "../components/ui";

/** List item Akita: цвет — через StatusTag (мягкая заливка + слово), не полосками. */
const StepRow = ({ step, today, onMarkDone, onHelp }: { step: PlanStep; today: string; onMarkDone?: (s: PlanStep) => void; onHelp?: (s: PlanStep) => void }) => {
  const { t } = useTheme();
  const overdue = step.status === "Overdue";
  return (
    <Row
      start={onMarkDone ? <Checkbox inputProps={{ "aria-label": `Отметить: ${step.title}` }} checked={step.status === "Done"} disabled={step.status === "Done"} onChange={() => onMarkDone(step)} sx={{ ml: -1 }} /> : undefined}
      title={step.title}
      sub={dueText(step, today)}
      end={<>
        <StatusTag status={step.status} />
        {onHelp && step.status !== "Done" && <Button variant="text" size="small" onClick={() => onHelp(step)}
          sx={{ minHeight: 36, px: 1.5, bgcolor: "transparent", "&:hover": { bgcolor: t.surfaceHover } }}>Помоги</Button>}
      </>}
      sx={overdue ? { bgcolor: t.badSoft } : undefined}
    />
  );
};

const TodayBlock = ({ steps, today, onMarkDone, onHelp }: {
  steps: PlanStep[]; today: string; onMarkDone: (s: PlanStep) => void; onHelp: (s: PlanStep) => void;
}) => (
  <Block title="Сегодня">
    {!steps.length ? <Empty text="Шагов на сегодня нет. Можно заглянуть в план или базу знаний." /> : (
      steps.map((s) => <StepRow key={s.id} step={s} today={today} onMarkDone={onMarkDone} onHelp={onHelp} />)
    )}
  </Block>
);

/** Этапы как list item + StatusTag (без мини-полосок — они спорили с общей). */
const StageList = ({ plan }: { plan: PlanData }) => {
  const stages = plan.stages.map((st) => {
    const steps = plan.steps.filter((s) => s.stage === st.id);
    return { st, total: steps.length, done: steps.filter((s) => s.status === "Done").length, overdue: steps.filter((s) => s.status === "Overdue").length };
  }).filter((x) => x.total > 0);
  const current = stages.find((x) => x.done < x.total);
  return (
    <Box>
      {stages.map((x) => {
        const done = x.done >= x.total;
        const active = x === current;
        const tag = done ? "Done" : active ? "Today" : "Planned";
        const label = done ? "Готово" : active ? "Текущий" : "Впереди";
        return (
          <Row
            key={x.st.id}
            title={x.st.title}
            sub={`${x.done} из ${x.total}${x.overdue ? ` · просрочено ${x.overdue}` : ""}`}
            end={<StatusTag status={tag} label={label} />}
          />
        );
      })}
    </Box>
  );
};

export const Progress = ({ plan, onOpen }: { plan?: PlanData; onOpen?: () => void }) => {
  const { t } = useTheme();
  const done = plan?.steps.filter((s) => s.status === "Done").length ?? 0;
  const total = plan?.steps.length ?? 0;
  const overdueCount = plan?.steps.filter((s) => s.status === "Overdue").length ?? 0;
  return (
    <Block title="Путь адаптации" aside={onOpen && <Button variant="text" size="small" onClick={onOpen}
      sx={{ minHeight: 36, bgcolor: "transparent", "&:hover": { bgcolor: t.surfaceHover } }}>Весь план</Button>}>
      {!plan ? <Empty text="План ещё готовится — бадди и руководитель его утвердят." variant={2} /> : (
        <Stack gap={2.5}>
          <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Stack direction="row" alignItems="baseline" gap={2}>
              <Typography sx={{ fontSize: 56, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 0.95 }}>
                {plan.progress_pct}<Box component="span" sx={{ fontSize: 28, fontWeight: 300 }}>%</Box>
              </Typography>
              <Typography color="text.secondary" sx={{ pb: 0.5 }}>{done} из {total} шагов</Typography>
            </Stack>
            {overdueCount > 0 && <StatusTag status="Overdue" label={`Есть просрочки: ${overdueCount}`} />}
          </Stack>
          <Box sx={{ height: 8, bgcolor: t.bg, overflow: "hidden" }} aria-hidden>
            <Box sx={{ height: "100%", width: `${plan.progress_pct}%`, bgcolor: overdueCount ? brand.red : brand.green }} />
          </Box>
          <StageList plan={plan} />
          <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.75}>
              <StatusTag status={plan.next_step ? "Today" : "Done"} label={plan.next_step ? "Следующий шаг" : "Готово"} />
            </Stack>
            <Typography fontWeight={500}>
              {plan.next_step ? plan.next_step.title : "Все шаги пройдены"}
            </Typography>
          </Box>
        </Stack>
      )}
    </Block>
  );
};

export const DayPage = ({ data, onMarkDone, onAsk, onOpenPlan, onOpenQuestions, waiting }: {
  data: DataState; onMarkDone: (s: PlanStep) => void; onAsk: (text: string) => void; onOpenPlan: () => void; onOpenQuestions?: () => void; waiting: ReactNode;
}) => {
  const { t } = useTheme();
  const first = data.me.name.split(" ")[0];
  const steps = [...(data.today?.steps ?? [])].sort((a, b) => Number(b.status === "Overdue") - Number(a.status === "Overdue"));
  const open = steps.filter((s) => s.status !== "Done");
  const events = data.today?.events ?? [];
  return <>
    <PageHead context={`${longDate(data.me.today)} · ${data.me.week}-я неделя стажировки`}
      title={open.length ? `${first}, на сегодня ${open.length} ${plural(open.length, "шаг", "шага", "шагов")}` : `${first}, на сегодня всё сделано`} />
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.6fr) minmax(280px, 1fr)" }, gap: { xs: 4, md: 5 } }}>
      <Stack gap={5}>
        <TodayBlock
          steps={steps}
          today={data.me.today}
          onMarkDone={onMarkDone}
          onHelp={(x) => onAsk(`Помоги с шагом: ${x.title}`)}
        />
        <Progress plan={data.plan} onOpen={onOpenPlan} />
      </Stack>
      <Stack gap={5}>
        <Block title="Ближайшее" tone="surface">
          {events.length ? events.map((e, i) => (
            <Stack key={`${e.start}-${e.title}`} gap={2.5}
              sx={i > 0 ? { pt: 2.5, borderTop: `1px solid ${t.line}` } : undefined}>
              <Stack direction="row" alignItems="flex-end" gap={2}>
                <Typography sx={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1, flex: "none" }}>{e.start}</Typography>
                <Typography fontWeight={500} color="text.secondary" sx={{ lineHeight: 1.2, pb: "2px" }}>{e.title}</Typography>
              </Stack>
              <Button
                variant="contained"
                component="a"
                href="https://zoom.us/j/9001001002?pwd=demo"
                target="_blank"
                rel="noopener noreferrer"
                fullWidth
                sx={{ minHeight: 44 }}
              >
                Войти в Zoom
              </Button>
            </Stack>)) : <Typography color="text.secondary">Сегодня без встреч.</Typography>}
        </Block>
        <Block title="Мои вопросы" aside={onOpenQuestions && <Button variant="text" size="small" sx={{ minHeight: 36 }} onClick={onOpenQuestions}>Все</Button>}>
          {data.questions.length ? data.questions.slice(-3).reverse().map((q) => (
            <Row
              key={q.id}
              title={q.title || q.text || "Вопрос"}
              sub={`Кому: ${q.addressee}`}
              end={<StatusTag status={q.status} />}
              onClick={onOpenQuestions}
              sx={q.status === "Answered" ? { bgcolor: t.okSoft } : q.status === "Sent" ? { bgcolor: t.waitSoft } : undefined}
            />))
            : <Empty text="Вопросов людям пока нет. Спроси Напарника — он сначала поищет в базе." variant={1} />}
        </Block>
        {waiting}
      </Stack>
    </Box>
  </>;
};

export const PlanPage = ({ plan, title, context, today, onMarkDone, picker }: {
  plan?: PlanData; title: string; context: string; today: string; onMarkDone?: (s: PlanStep) => void; picker?: ReactNode;
}) => <>
  <PageHead context={context} title={title} action={picker} />
  {!plan ? <Empty text="План ещё не утверждён." variant={2} /> : <Stack gap={5}>
    <Progress plan={plan} />
    {plan.stages.map((stage) => {
      const steps = plan.steps.filter((s) => s.stage === stage.id && s.owner === "intern");
      if (!steps.length) return null;
      const done = steps.filter((s) => s.status === "Done").length;
      return <Block key={stage.id} title={stage.title} aside={<Typography variant="body2" color="text.secondary">{done} из {steps.length}</Typography>}>
        {steps.map((s) => <StepRow key={s.id} step={s} today={today} onMarkDone={onMarkDone} />)}
      </Block>;
    })}
  </Stack>}
</>;
