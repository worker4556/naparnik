import type { ReactNode } from "react";
import { CssBaseline, ThemeProvider, type Theme } from "@mui/material";

/** Провайдеры оболочки приложения (тема, baseline). */
export const AppProviders = ({ theme, children }: { theme: Theme; children: ReactNode }) => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    {children}
  </ThemeProvider>
);
