// База знаний: поиск, папки-фильтры, страница целиком. Автор и дата — у каждой страницы (BR-01, BR-04).
import { useMemo, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { SearchRounded } from "@mui/icons-material";
import type { KbPage } from "@/shared/api";
import type { DataState } from "@/shared/lib";
import { Empty, PageHead } from "@/shared/ui";
import { Markdown } from "@/widgets/chat";

const PageCard = ({ page, folder, folderIndex = 0, onOpen }: { page: KbPage; folder?: string; folderIndex?: number; onOpen: () => void }) => {
  const { t, space, type, motion } = useTheme();
  const softs = t.folderSoft;
  const dots = t.folderDot;
  const i = folderIndex % softs.length;
  return (
    <Box component="button" onClick={onOpen} sx={{
      textAlign: "left", font: "inherit", color: "inherit", bgcolor: t.surface, border: "none",
      p: `${space[5]}px`, display: "flex", flexDirection: "column", gap: 1, minHeight: 180,
      transition: `background-color ${motion.fast}`, "&:hover": { bgcolor: t.surfaceHover },
    }}>
      {folder && (
        <Box component="span" sx={{
          alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 0.75,
          px: 1, py: 0.25, bgcolor: softs[i], color: t.text, fontSize: type.size.sm, fontWeight: type.weight.semibold,
        }}>
          <Box component="span" aria-hidden sx={{ width: 6, height: 6, bgcolor: dots[i], flex: "none" }} />
          {folder}
        </Box>
      )}
      <Typography variant="h3" component="h3">{page.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{page.excerpt}</Typography>
      <Box mt="auto" pt={1}>
        <Typography variant="caption" color="text.secondary">{page.author} · {new Date(`${page.updated_at}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</Typography>
      </Box>
    </Box>
  );
};

export const KnowledgePage = ({ data, onAsk }: { data: DataState; onAsk: (text: string) => void }) => {
  const theme = useTheme();
  const { t, breakpoints, type } = theme;
  const softs = t.folderSoft;
  const dots = t.folderDot;
  const mobile = useMediaQuery(breakpoints.down("sm"));
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [open, setOpen] = useState<KbPage | null>(null);
  const folderTitle = (id: string) => data.folders.find((f) => f.id === id)?.title;
  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.pages.filter((p) => (!folder || p.folder === folder) && (!q || `${p.title} ${p.body ?? p.excerpt}`.toLowerCase().includes(q)));
  }, [data.pages, folder, query]);
  const folderIndex = (id: string) => Math.max(0, data.folders.findIndex((f) => f.id === id));
  const chip = (id: string, label: string, count: number, colorIndex?: number) => {
    const active = folder === id;
    const soft = colorIndex != null ? softs[colorIndex % softs.length] : t.surface;
    const dot = colorIndex != null ? dots[colorIndex % dots.length] : t.muted;
    return (
      <Box component="button" key={id || "all"} onClick={() => setFolder(id)} aria-pressed={active} sx={{
        font: "inherit", fontSize: type.size.md, fontWeight: type.weight.semibold, border: "none", px: 1.5, py: 0.75, whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", gap: 0.75,
        bgcolor: active ? t.inverse : soft, color: active ? t.onInverse : t.text,
        "&:hover": { bgcolor: active ? t.inverse : t.surfaceHover },
      }}>
        {!active && colorIndex != null && <Box component="span" aria-hidden sx={{ width: 6, height: 6, bgcolor: dot, flex: "none" }} />}
        {label} <Box component="span" sx={{ opacity: 0.65 }}>{count}</Box>
      </Box>
    );
  };
  return <>
    <PageHead context={data.me.department} title="База знаний" />
    <TextField fullWidth value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в базе команды" aria-label="Поиск по базе знаний"
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> } }} sx={{ mb: 2 }} />
    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
      {chip("", "Все", data.pages.length)}
      {data.folders.map((f, i) => chip(f.id, f.title, data.pages.filter((p) => p.folder === f.id).length, i))}
    </Stack>
    {pages.length ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
      {pages.map((p) => <PageCard key={p.id} page={p} folder={folder ? undefined : folderTitle(p.folder)} folderIndex={folderIndex(p.folder)} onOpen={() => setOpen(p)} />)}
    </Box> : <Empty text={`Ничего не нашлось${query ? ` по «${query}»` : ""}. Спроси Напарника — он поищет и подскажет, к кому идти.`} variant={1}
      action={<Button variant="text" onClick={() => onAsk(query)}>Спросить Напарника</Button>} />}
    <Dialog open={Boolean(open)} onClose={() => setOpen(null)} fullWidth maxWidth="md" fullScreen={mobile}>
      {open && <>
        <DialogTitle sx={{ pb: 0.5 }}>{open.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>{folderTitle(open.folder)} · {open.author} · обновлено {new Date(`${open.updated_at}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</Typography>
          <Markdown text={open.body || open.excerpt} />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button variant="text" onClick={() => setOpen(null)}>Закрыть</Button>
          <Button variant="contained" onClick={() => { onAsk(`Расскажи подробнее: ${open.title}`); setOpen(null); }}>Спросить Напарника</Button>
        </DialogActions>
      </>}
    </Dialog>
  </>;
};
