import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import { brand } from "@/shared/theme";
import type { PlanData } from "@/shared/api";
import { Block, Empty, Row, StatusTag } from "@/shared/ui";

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

/** Путь адаптации: % + этапы + следующий шаг. */
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
              <Typography sx={{ fontSize: (theme) => theme.type.size.displayLg, fontWeight: (theme) => theme.type.weight.regular, letterSpacing: (theme) => theme.type.tracking.display, lineHeight: 0.95 }}>
                {plan.progress_pct}<Box component="span" sx={{ fontSize: (theme) => theme.type.size.displayMd, fontWeight: (theme) => theme.type.weight.regular }}>%</Box>
              </Typography>
              <Typography color="text.secondary" sx={{ pb: 0.5, fontWeight: (theme) => theme.type.weight.regular }}>{done} из {total} шагов</Typography>
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
