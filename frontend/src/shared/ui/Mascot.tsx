// Маскот Напарника: исходник уже со «сценой»-кругом — не дублируем градиентный диск.
import type { ReactNode } from "react";
import { Box } from "@mui/material";
import mascotImg from "@/shared/assets/maskot2.png";

const ASPECT = 480 / 526;

export const MascotBadge = ({ size, float, badge }: { size: number; float?: boolean; badge?: ReactNode }) => {
  const w = size * 1.2;
  const h = w * ASPECT;
  return (
    <Box
      aria-hidden={!badge}
      sx={{
        position: "relative",
        width: w,
        height: h,
        flex: "none",
        filter: "drop-shadow(0 10px 18px rgba(0, 80, 180, .28))",
        // Дыхание на всём контейнере — бейдж уведомлений едет вместе с маскотом
        animation: float ? "mascot-breathe 5s ease-in-out infinite" : undefined,
        "@keyframes mascot-breathe": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
        },
      }}
    >
      <Box
        component="img"
        src={mascotImg}
        alt=""
        sx={{ width: "100%", height: "100%", display: "block", objectFit: "contain", maxWidth: "none" }}
      />
      {badge}
    </Box>
  );
};
