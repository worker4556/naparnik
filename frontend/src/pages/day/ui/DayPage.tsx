// Страница «Мой день» (FSD: pages/day).
import type { ReactNode } from "react";
import { Box, Button, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ChatTurn, PlanStep } from "@/shared/api";
import { longDate, plural } from "@/shared/lib";
import type { DataState } from "@/shared/lib";
import { Block, Empty, PageHead, Row, StatusTag } from "@/shared/ui";
import { Progress, StepRow } from "@/entities/plan";

const TodayBlock = ({ steps, today, onMarkDone, onHelp, onTeam }: {
  steps: PlanStep[]; today: string; onMarkDone: (s: PlanStep) => void; onHelp: (s: PlanStep) => void; onTeam?: () => void;
}) => (
  <Block title="Сегодня">
    {!steps.length ? <Empty text="Шагов на сегодня нет. Можно заглянуть в план или базу знаний." /> : (
      steps.map((s) => <StepRow key={s.id} step={s} today={today} onMarkDone={onMarkDone} onHelp={onHelp} onTeam={onTeam} />)
    )}
  </Block>
);

export const DayPage = ({ data, asked = [], onMarkDone, onAsk, onOpenPlan, onOpenQuestions, onTeam, waiting, practice }: {
  data: DataState; asked?: ChatTurn[]; onTeam?: () => void; onMarkDone: (s: PlanStep) => void; onAsk: (text: string) => void; onOpenPlan: () => void; onOpenQuestions?: () => void; waiting: ReactNode; practice?: ReactNode;
}) => {
  const theme = useTheme();
  const { t, size, breakpoints } = theme;
  /** Без spanning-grid и без display:contents — иначе высокая правая колонка делает дыру между «Сегодня» и «Путём адаптации». */
  const desktop = useMediaQuery(breakpoints.up("md"));
  const first = data.me.name.split(" ")[0];
  const steps = [...(data.today?.steps ?? [])].sort((a, b) => Number(b.status === "Overdue") - Number(a.status === "Overdue"));
  const open = steps.filter((s) => s.status !== "Done");
  const events = data.today?.events ?? [];

  const todayBlock = (
    <TodayBlock
      steps={steps}
      today={data.me.today}
      onMarkDone={onMarkDone}
      onHelp={(x) => onAsk(`Помоги с шагом: ${x.title}`)}
      onTeam={onTeam}
    />
  );
  const progressBlock = <Progress plan={data.plan} onOpen={onOpenPlan} />;
  const nearby = (
    <Block title="Ближайшее" tone="surface">
      {events.length ? events.map((e, i) => (
        <Stack key={`${e.start}-${e.title}`} gap={2.5}
          sx={i > 0 ? { pt: 2.5, borderTop: `1px solid ${t.line}` } : undefined}>
          <Stack direction="row" alignItems="flex-end" gap={2} flexWrap="wrap">
            <Typography sx={(th) => ({
              fontSize: { xs: th.type.size.h2, md: th.type.size.display },
              fontWeight: th.type.weight.medium,
              letterSpacing: th.type.tracking.snug,
              lineHeight: 1,
              flex: "none",
            })}>{e.start}</Typography>
            <Typography fontWeight={500} color="text.secondary" sx={{ lineHeight: 1.2, pb: "2px", minWidth: 0, flex: "1 1 120px" }}>{e.title}</Typography>
          </Stack>
          <Button
            variant="contained"
            component="a"
            href="https://zoom.us/j/9001001002?pwd=demo"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
            sx={{ minHeight: size.control }}
          >
            Войти в конференцию
          </Button>
        </Stack>)) : <Typography color="text.secondary">Сегодня без встреч.</Typography>}
    </Block>
  );
  const questions = (
    <Block title="Вопросы" aside={onOpenQuestions && <Button variant="text" size="small" sx={{ minHeight: { xs: size.control, sm: size.controlSm } }} onClick={onOpenQuestions}>Все</Button>}>
      {data.questions.slice(-3).reverse().map((q) => (
        <Row
          key={q.id}
          title={q.title || q.text || "Вопрос"}
          sub={`Кому: ${q.addressee}`}
          end={<StatusTag status={q.status} />}
          onClick={onOpenQuestions}
        />))}
      {/* Вопросы людям важнее; свободные строки занимают последние вопросы Напарнику — они тоже не теряются. */}
      {(data.questions.length >= 3 ? [] : asked.slice(-(3 - data.questions.length))).reverse().map((x) => (
        <Row
          key={x.id}
          title={x.question}
          sub={x.reply.sources.length ? `Напарник ответил по базе: ${x.reply.sources[0].title}` : "Ответил Напарник"}
          end={<StatusTag status="Answered" label="Напарник" />}
          onClick={onOpenQuestions}
        />))}
      {!data.questions.length && !asked.length && <Empty text="Вопросов пока нет. Спроси Напарника — он сначала поищет в базе." icon={false} />}
    </Block>
  );

  return <>
    <PageHead context={`${longDate(data.me.today)} · ${data.me.week}-я неделя стажировки`}
      title={open.length ? `${first}, на сегодня ${open.length} ${plural(open.length, "шаг", "шага", "шагов")}` : `${first}, на сегодня всё сделано`} />
    {desktop ? (
      <>
        <Box sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 5,
          alignItems: "start",
        }}>
          <Stack gap={5} sx={{ minWidth: 0, alignSelf: "start" }}>
            {todayBlock}
            {progressBlock}
          </Stack>
          <Stack gap={5} sx={{ minWidth: 0 }}>
            {nearby}
            {questions}
            {waiting}
          </Stack>
        </Box>
        {/* flush сбрасывает mt панели — на десктопе возвращаем отступ от сетки. */}
        {practice && <Box sx={{ mt: 5 }}>{practice}</Box>}
      </>
    ) : (
      /* Мобилка: действие и время сверху, практика и коммуникации следом, прогресс адаптации внизу. */
      <Stack gap={2}>
        {todayBlock}
        {nearby}
        {practice}
        {questions}
        {waiting}
        {progressBlock}
      </Stack>
    )}
  </>;
};
