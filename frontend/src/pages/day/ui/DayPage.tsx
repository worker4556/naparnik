// Страница «Мой день» (FSD: pages/day).
import type { ReactNode } from "react";
import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import type { PlanStep } from "@/shared/api";
import { longDate, plural } from "@/shared/lib";
import type { DataState } from "@/shared/lib";
import { Block, Empty, PageHead, Row, StatusTag } from "@/shared/ui";
import { Progress, StepRow } from "@/entities/plan";

const TodayBlock = ({ steps, today, onMarkDone, onHelp }: {
  steps: PlanStep[]; today: string; onMarkDone: (s: PlanStep) => void; onHelp: (s: PlanStep) => void;
}) => (
  <Block title="Сегодня">
    {!steps.length ? <Empty text="Шагов на сегодня нет. Можно заглянуть в план или базу знаний." /> : (
      steps.map((s) => <StepRow key={s.id} step={s} today={today} onMarkDone={onMarkDone} onHelp={onHelp} />)
    )}
  </Block>
);

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
                <Typography sx={{ fontSize: (theme) => theme.type.size.display, fontWeight: (theme) => theme.type.weight.medium, letterSpacing: (theme) => theme.type.tracking.snug, lineHeight: 1, flex: "none" }}>{e.start}</Typography>
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
                Войти в конференцию
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
