// База знаний: поиск, папки-фильтры, страница целиком. Автор и дата — у каждой страницы (BR-01, BR-04).
import { useEffect, useMemo, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { ExpandLess, ExpandMore, SearchRounded } from "@mui/icons-material";
import type { KbPage } from "@/shared/api";
import type { DataState } from "@/shared/lib";
import { plural } from "@/shared/lib";
import { DialogClose, dialogTitleSx, Empty, PageHead } from "@/shared/ui";
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

export const KnowledgePage = ({ data, onAsk, openId, onOpened }: {
  data: DataState; onAsk: (text: string) => void;
  /** Открыть страницу сразу — например, по ссылке из карты команды; onOpened сбрасывает запрос. */
  openId?: string; onOpened?: () => void;
}) => {
  const theme = useTheme();
  const { t, breakpoints, type } = theme;
  const softs = t.folderSoft;
  const dots = t.folderDot;
  const mobile = useMediaQuery(breakpoints.down("sm"));
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [open, setOpen] = useState<KbPage | null>(null);
  /** На мобилке фильтры по умолчанию свёрнуты — иначе бейджи съедают весь экран. */
  const [foldersExpanded, setFoldersExpanded] = useState(false);
  useEffect(() => {
    if (!openId) return;
    const page = data.pages.find((p) => p.id === openId);
    if (page) setOpen(page);
    onOpened?.();
  }, [openId, data.pages, onOpened]);
  useEffect(() => {
    if (!mobile) setFoldersExpanded(false);
  }, [mobile]);
  const folderTitle = (id: string) => data.folders.find((f) => f.id === id)?.title;
  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.pages.filter((p) => (!folder || p.folder === folder) && (!q || `${p.title} ${p.body ?? p.excerpt}`.toLowerCase().includes(q)));
  }, [data.pages, folder, query]);
  const folderIndex = (id: string) => Math.max(0, data.folders.findIndex((f) => f.id === id));
  const folderChips = useMemo(() => data.folders.map((f, i) => ({
    id: f.id,
    title: f.title,
    count: data.pages.filter((p) => p.folder === f.id).length,
    colorIndex: i,
  })), [data.folders, data.pages]);
  /** В свёрнутом виде: «Все» + активная папка (если не «Все») + ещё 1–2 соседних, остальное за «Ещё». */
  const visibleFolderChips = useMemo(() => {
    if (!mobile || foldersExpanded) return folderChips;
    const selected = folderChips.find((f) => f.id === folder);
    const rest = folderChips.filter((f) => f.id !== folder);
    const head = selected ? [selected, ...rest.slice(0, 1)] : rest.slice(0, 2);
    return head;
  }, [mobile, foldersExpanded, folderChips, folder]);
  const hiddenFolderCount = mobile && !foldersExpanded
    ? Math.max(0, folderChips.length - visibleFolderChips.length)
    : 0;
  const chip = (id: string, label: string, count: number, colorIndex?: number) => {
    const active = folder === id;
    const soft = colorIndex != null ? softs[colorIndex % softs.length] : t.surface;
    const dot = colorIndex != null ? dots[colorIndex % dots.length] : t.muted;
    return (
      <Box component="button" key={id || "all"} onClick={() => setFolder(id)} aria-pressed={active} sx={{
        font: "inherit", fontSize: type.size.md, fontWeight: type.weight.semibold, border: "none", px: 1.5, py: 0.75, whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", gap: 0.75, flex: "none",
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
    <Stack
      direction="row"
      flexWrap={{ xs: foldersExpanded ? "wrap" : "nowrap", sm: "wrap" }}
      gap={1}
      alignItems="center"
      sx={{
        mb: { xs: 2, md: 3 },
        overflowX: { xs: foldersExpanded ? "visible" : "auto", sm: "visible" },
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {chip("", "Все", data.pages.length)}
      {visibleFolderChips.map((f) => chip(f.id, f.title, f.count, f.colorIndex))}
      {mobile && (hiddenFolderCount > 0 || foldersExpanded) && (
        <Box
          component="button"
          onClick={() => setFoldersExpanded((v) => !v)}
          aria-expanded={foldersExpanded}
          aria-label={foldersExpanded ? "Свернуть категории" : `Ещё ${hiddenFolderCount} ${plural(hiddenFolderCount, "категория", "категории", "категорий")}`}
          sx={{
            font: "inherit", fontSize: type.size.md, fontWeight: type.weight.semibold, border: "none", px: 1.5, py: 0.75, whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 0.5, flex: "none",
            bgcolor: t.surface, color: t.text,
            "&:hover": { bgcolor: t.surfaceHover },
          }}
        >
          {foldersExpanded ? "Свернуть" : `Ещё ${hiddenFolderCount}`}
          {foldersExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </Box>
      )}
    </Stack>
    {pages.length ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
      {pages.map((p) => <PageCard key={p.id} page={p} folder={folder ? undefined : folderTitle(p.folder)} folderIndex={folderIndex(p.folder)} onOpen={() => setOpen(p)} />)}
    </Box> : <Empty text={`Ничего не нашлось${query ? ` по «${query}»` : ""}. Спроси Напарника — он поищет и подскажет, к кому идти.`} variant={1}
      action={<Button variant="text" onClick={() => onAsk(query)}>Спросить Напарника</Button>} />}
    <Dialog open={Boolean(open)} onClose={() => setOpen(null)} fullWidth maxWidth="md" fullScreen={mobile}>
      {open && <>
        <DialogTitle sx={{ ...dialogTitleSx, pb: 0.5 }}>
          <Box component="span" sx={{ flex: 1, minWidth: 0, pr: 1 }}>{open.title}</Box>
          <DialogClose onClose={() => setOpen(null)} />
        </DialogTitle>
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
