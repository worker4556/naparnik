import { IconButton, Tooltip } from "@mui/material";
import { DarkModeOutlined, LightModeOutlined } from "@mui/icons-material";
import type { Mode } from "@/shared/theme";

/** Переключатель светлой / тёмной темы. */
export const ThemeToggle = ({ mode, onToggle }: { mode: Mode; onToggle: () => void }) => (
  <Tooltip title={mode === "light" ? "Тёмная тема" : "Светлая тема"}>
    <IconButton aria-label="Сменить тему" onClick={onToggle}>
      {mode === "light" ? <DarkModeOutlined /> : <LightModeOutlined />}
    </IconButton>
  </Tooltip>
);
