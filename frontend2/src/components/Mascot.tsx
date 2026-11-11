// Маскот Напарника: исходник уже со «сценой»-кругом — не дублируем градиентный диск.
import { Box } from "@mui/material";
import mascotImg from "../assets/maskot2.png";

const ASPECT = 480 / 526;

export const MascotBadge = ({ size, float }: { size: number; float?: boolean }) => {
  const w = size * 1.2;
  const h = w * ASPECT;
  return (
    <Box
      aria-hidden
      sx={{
        width: w,
        height: h,
        flex: "none",
        filter: "drop-shadow(0 10px 18px rgba(0, 80, 180, .28))",
        "& img": float ? { animation: "mascot-breathe 5s ease-in-out infinite" } : undefined,
        "@keyframes mascot-breathe": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "& img": { animation: "none" },
        },
      }}
    >
      <Box
        component="img"
        src={mascotImg}
        alt=""
        sx={{ width: "100%", height: "100%", display: "block", objectFit: "contain", maxWidth: "none" }}
      />
    </Box>
  );
};
