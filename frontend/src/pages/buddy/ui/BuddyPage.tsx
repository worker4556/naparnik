// Страница бадди (FSD: pages/buddy).
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import type { DataState } from "@/shared/lib";
import { Block, Empty, PageHead } from "@/shared/ui";

export const BuddyPage = ({ data, onPlan, onQuestions }: { data: DataState; onPlan: (id: string) => void; onQuestions: () => void }) => {
  const stuck = data.managedPlans.filter((i) => i.plan?.steps.some((s) => s.status === "Overdue"));
  const routed = data.questions.filter((q) => q.asked_by !== data.me.id && q.status === "Sent").length;
  return <>
    <PageHead context={`Бадди · ${data.me.department}`}
      title={stuck.length ? `${stuck.map((i) => i.name.split(" ")[0]).join(", ")}: есть просрочки` : "У стажёров всё идёт по плану"}
      action={routed > 0 && <Button variant="text" onClick={onQuestions}>Вопросы в пути: {routed}</Button>} />
    <Block title="Мои стажёры">
      {data.managedPlans.length ? data.managedPlans.map((i) => {
        const overdue = i.plan?.steps.filter((s) => s.status === "Overdue") ?? [];
        return <Box key={i.id} sx={{ py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
            <Box>
              <Typography fontWeight={600}>{i.name}</Typography>
              <Typography variant="body2" color="text.secondary">{i.plan ? (overdue.length ? `Застрял: ${overdue.map((s) => s.title).join("; ")}` : `Дальше: ${i.plan.next_step?.title ?? "все шаги пройдены"}`) : "План готовится"}</Typography>
            </Box>
            <Button variant="text" onClick={() => onPlan(i.id)} sx={{ alignSelf: { sm: "center" } }}>Открыть план</Button>
          </Stack>
          {i.plan && <Stack direction="row" alignItems="center" gap={1.5} mt={1.5}>
            <LinearProgress variant="determinate" value={i.plan.progress_pct} aria-label={`Прогресс ${i.name}`} sx={{ flex: 1 }} />
            <Typography variant="body2" sx={{ minWidth: 40, textAlign: "right" }}>{i.plan.progress_pct}%</Typography>
          </Stack>}
        </Box>;
      }) : <Empty text="За тобой пока не закреплены стажёры." />}
    </Block>
  </>;
};
