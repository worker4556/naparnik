import { Button, Checkbox, useTheme } from "@mui/material";
import type { PlanStep } from "@/shared/api";
import { dueText } from "@/shared/lib";
import { Row, StatusTag } from "@/shared/ui";

/** Шаг плана: list item Akita + StatusTag (без цветных полосок). */
export const StepRow = ({ step, today, onMarkDone, onHelp }: {
  step: PlanStep; today: string; onMarkDone?: (s: PlanStep) => void; onHelp?: (s: PlanStep) => void;
}) => {
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
