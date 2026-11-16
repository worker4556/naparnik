import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography, useTheme } from "@mui/material";
import { api, unwrap } from "@/shared/api";
import { brand } from "@/shared/theme";
import { DraftCard, Markdown, type Draft } from "@/widgets/chat";
import { Block, DialogClose, dialogTitleSx, StatusTag, TestLabel } from "@/shared/ui";

type Source = { page_id: string; title: string; author: string; updated_at: string; body: string };
type Term = { term: string; definition?: string; summary?: string; label?: string };
type Task = { text: string; dataset: string; environment: string; criteria: string[] };
type Attempt = { number: number; answer: string; review: { passed: boolean; score: number; checks: { criterion: number; passed: boolean; feedback: string; sources?: string[] }[] } };
type Practice = {
  id: string; intern_id: string; intern_name: string; step: { title: string }; offer: string; stage: string;
  offered_today: boolean; available: boolean; task_status: string; task_version: number; approval_due?: string; approval_expired: boolean;
  general_terms: Term[]; team_terms: Term[]; team_rules: { title: string }[]; sources: Source[]; task?: Task; checklist?: string[];
  attempts?: Attempt[]; best_attempt?: Attempt; attempts_count: number; error_topics: string[]; help_available: boolean;
};
type Run = (path: string, body: unknown, key?: string) => Promise<unknown>;

const stageTitle: Record<string, string> = {
  offered: "Перед задачей",
  general_terms: "Общие термины",
  team_terms: "Термины и правила команды",
  training: "Учебное задание",
  real_task: "К реальной задаче",
};

const PracticeCard = ({ item: p, buddy, busy, run, login }: { item: Practice; buddy: boolean; busy: boolean; run: Run; login: string }) => {
  const { t, space, type, size, stroke } = useTheme();
  const path = `/api/practices/${p.intern_id}/${p.id}`;
  const [text, setText] = useState(p.task?.text ?? "");
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sent, setSent] = useState(false);
  const attemptKey = useRef<{ signature: string; key: string } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  useEffect(() => { setText(p.task?.text ?? ""); }, [p.task_version, p.task?.text]);
  const advance = (action: string) => void run(`${path}/advance`, { action, expected_stage: p.stage });
  const last = p.attempts?.at(-1);
  const passed = p.attempts?.some((a) => a.review.passed);

  const primaryBtn = {
    minHeight: size.control,
    alignSelf: { xs: "stretch", md: "flex-start" } as const,
    width: { xs: "100%", md: "auto" },
  };
  const secondaryBtn = {
    minHeight: size.controlSm,
    px: `${space[3]}px`,
    bgcolor: "transparent",
    "&:hover": { bgcolor: t.surfaceHover },
  };
  const actionsCol = {
    gap: `${space[2]}px`,
    alignItems: { xs: "stretch", md: "flex-start" } as const,
  };

  const offerSteps = [
    { label: "Общие термины", soft: t.folderSoft[0], dot: t.folderDot[0] },
    { label: "Термины команды", soft: t.folderSoft[2], dot: t.folderDot[2] },
    { label: "Учебное задание", soft: t.folderSoft[1], dot: t.folderDot[1] },
  ];

  return (
    <Block
      title={buddy ? `Практика: ${p.intern_name}` : "Практика перед задачей"}
      aside={buddy && p.task_status === "Draft" ? <StatusTag status="pending" label="Нужно одобрение" /> : undefined}
    >
      <Stack gap={{ xs: `${space[5]}px`, md: `${space[6]}px` }}>
        <Stack gap={`${space[2]}px`}>
          <Typography fontWeight={type.weight.medium} sx={{ fontSize: type.size.lg, lineHeight: type.line.snug }}>
            {p.step.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {buddy
              ? "Одобри учебное задание. Стажёр может пройти практику или сразу взять реальную задачу."
              : p.offered_today ? p.offer : "Практика к будущему шагу плана — можно подготовиться заранее."}
          </Typography>
        </Stack>

      {!p.available && <Alert severity="info">Материалы пока недоступны. Можно повторить подготовку или перейти к задаче.</Alert>}

        {buddy ? (
          <Stack gap={`${space[4]}px`}>
            {p.task_status === "Pending" && (
              <Stack gap={`${space[3]}px`} sx={{ p: `${space[4]}px`, bgcolor: t.waitSoft }}>
                <StatusTag status="pending" label="Нужна подготовка" />
                <Typography>Черновик ещё не подготовлен.</Typography>
                <Button variant="contained" disabled={busy} onClick={() => void run(`${path}/generate`, {})} sx={primaryBtn}>Подготовить задание</Button>
              </Stack>
            )}
            {p.task && (
              <Stack gap={`${space[4]}px`}>
                <Stack gap={`${space[2]}px`}>
                  <Stack direction="row" flexWrap="wrap" gap={`${space[2]}px`} alignItems="center">
                    <StatusTag
                      status={p.task_status === "Draft" ? "pending" : "approved"}
                      label={p.task_status === "Draft" ? "Ждёт одобрения" : "Одобрено"}
                    />
                    <TestLabel />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    Учебные данные: {p.task.dataset}
                  </Typography>
                </Stack>

                {p.task_status === "Draft" ? (
                  <Stack gap={`${space[3]}px`}>
                    <Box>
                      <Typography
                        component="label"
                        htmlFor="practice-draft"
                        variant="body2"
                        fontWeight={type.weight.semibold}
                        sx={{ display: "block", mb: `${space[2]}px` }}
                      >
                        Черновик учебного задания
                      </Typography>
                      <TextField
                        id="practice-draft"
                        fullWidth
                        multiline
                        minRows={4}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        sx={{ "& .MuiInputBase-root": { bgcolor: t.bg } }}
                      />
                    </Box>
                    <Box sx={{ p: `${space[3]}px`, bgcolor: t.waitSoft }}>
                      <Typography variant="body2">
                        Одобрение до {p.approval_due}. Если не успеешь, стажёр продолжит без задания; черновик останется здесь.
                      </Typography>
                    </Box>
                    <Button variant="contained" disabled={busy || !text.trim()} onClick={() => void run(`${path}/approve`, { text, task_version: p.task_version })} sx={primaryBtn}>Одобрить задание</Button>
                  </Stack>
                ) : (
                  <Stack gap={`${space[3]}px`}>
                    <Box sx={{ p: `${space[3]}px`, bgcolor: t.okSoft }}>
                      <Typography fontWeight={type.weight.semibold}>Задание одобрено</Typography>
                    </Box>
                    <Box sx={{ p: `${space[4]}px`, bgcolor: t.bg }}>
                      <Markdown text={p.task.text} />
                    </Box>
                  </Stack>
                )}

                <Stack gap={`${space[2]}px`}>
                  <Typography fontWeight={type.weight.semibold}>Критерии проверки</Typography>
                  <Stack gap={`${space[2]}px`}>
                    {p.task.criteria.map((c, i) => (
                      <Stack
                        key={c}
                        direction="row"
                        alignItems="flex-start"
                        gap={`${space[3]}px`}
                        sx={{ p: `${space[3]}px`, bgcolor: t.bg }}
                      >
                        <Box
                          aria-hidden
                          sx={{
                            width: 24,
                            height: 24,
                            flex: "none",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: t.folderSoft[i % t.folderSoft.length],
                            color: t.text,
                            fontSize: type.size.sm,
                            fontWeight: type.weight.bold,
                          }}
                        >
                          {i + 1}
                        </Box>
                        <Typography sx={{ pt: "2px", overflowWrap: "anywhere" }}>{c}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            )}
            <Box sx={{ p: `${space[3]}px`, bgcolor: t.bg }}>
              <Typography variant="body2" color="text.secondary">
                Попыток: {p.attempts_count}. Бадди видит лучшую попытку и темы ошибок; остальные ответы и диалог остаются у стажёра.
              </Typography>
            </Box>
            {p.best_attempt && (
              <Box sx={{ p: `${space[4]}px`, bgcolor: t.okSoft }}>
                <Typography fontWeight={type.weight.semibold} mb={`${space[2]}px`}>
                  Лучшая попытка №{p.best_attempt.number} · {p.best_attempt.review.score}%
                </Typography>
                <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: type.size.md, fontFamily: "inherit", bgcolor: t.bg, p: `${space[3]}px` }}>
                  {p.best_attempt.answer}
                </Box>
              </Box>
            )}
            {p.error_topics.length > 0 && (
              <Stack gap={`${space[2]}px`} sx={{ p: `${space[4]}px`, bgcolor: t.badSoft }}>
                <Typography fontWeight={type.weight.semibold}>Темы ошибок</Typography>
                <Box component="ul" sx={{ m: 0, pl: `${space[5]}px`, display: "grid", gap: `${space[1]}px` }}>
                  {p.error_topics.map((x) => <li key={x}>{x}</li>)}
                </Box>
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack gap={`${space[4]}px`}>
            {p.stage === "offered" ? (
              <Stack gap={`${space[4]}px`}>
                <Typography variant="h3" component="h3">{stageTitle[p.stage]}</Typography>

                <Stack direction="row" flexWrap="wrap" gap={`${space[2]}px`} alignContent="flex-start">
                  {offerSteps.map((step) => (
                    <Box
                      key={step.label}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: `${space[2]}px`,
                        minHeight: size.controlSm,
                        px: `${space[3]}px`,
                        py: `${space[2]}px`,
                        bgcolor: step.soft,
                        fontWeight: type.weight.semibold,
                        fontSize: type.size.md,
                      }}
                    >
                      <Box aria-hidden sx={{ width: 8, height: 8, flex: "none", bgcolor: step.dot }} />
                      {step.label}
                    </Box>
                  ))}
                </Stack>

                <Stack sx={actionsCol}>
                  <Button variant="contained" disabled={busy || !p.available} onClick={() => advance("start")} sx={primaryBtn}>
                    Начать практику
                  </Button>
                  <Button variant="text" disabled={busy} onClick={() => advance("skip_all")} sx={{ ...secondaryBtn, alignSelf: { xs: "center", md: "flex-start" } }}>
                    Сразу к реальной задаче
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Typography variant="h3" component="h3">{stageTitle[p.stage]}</Typography>
            )}

            {(p.stage === "general_terms" || p.stage === "team_terms") && (
              <Stack gap={`${space[4]}px`}>
                <Stack gap={`${space[3]}px`}>
                  {(p.stage === "general_terms" ? p.general_terms : p.team_terms).map((term) => (
                    <Box key={term.term} sx={{ py: `${space[3]}px`, borderBottom: `${stroke.hairline}px solid ${t.line}`, "&:last-child": { borderBottom: "none" } }}>
                      <Typography fontWeight={type.weight.semibold}>
                        {term.term}{term.label ? ` · ${term.label}` : " · у нас так говорят"}
                      </Typography>
                      <Typography sx={{ mt: `${space[1]}px` }}>{term.definition || term.summary}</Typography>
                    </Box>
                  ))}
                  {p.stage === "team_terms" && p.team_rules.map((r) => (
                    <Typography key={r.title} variant="body2">• {r.title}</Typography>
                  ))}
                </Stack>
                <Stack sx={actionsCol}>
                  <Button variant="contained" disabled={busy || !p.available} onClick={() => advance("next")} sx={primaryBtn}>Дальше</Button>
                  <Button variant="text" disabled={busy} onClick={() => advance("skip_stage")} sx={{ ...secondaryBtn, alignSelf: { xs: "center", md: "flex-start" } }}>Пропустить этот этап</Button>
                </Stack>
              </Stack>
            )}

            {p.stage === "training" && (
              <Stack gap={`${space[4]}px`}>
                {!p.task ? (
                  <Alert severity="info">
                    {p.approval_expired
                      ? "Бадди не ответил за рабочий день. Продолжай без учебного задания."
                      : "Бадди ещё не одобрил задание. Можно подождать или пропустить его."}
                  </Alert>
                ) : (
                  <Stack gap={`${space[3]}px`}>
          <TestLabel />
                    <Markdown text={p.task.text} />
                    <Box component="ul" sx={{ m: 0, pl: `${space[5]}px`, display: "grid", gap: `${space[1]}px` }}>
                      {p.task.criteria.map((c) => <li key={c}>{c}</li>)}
                    </Box>
                    {!passed && p.attempts_count < 3 && (
                      <Stack gap={`${space[3]}px`}>
                        <Box>
                          <Typography
                            component="label"
                            htmlFor="practice-attempt"
                            variant="body2"
                            fontWeight={type.weight.semibold}
                            sx={{ display: "block", mb: `${space[2]}px` }}
                          >
                            Твоя попытка
                          </Typography>
                          <TextField
                            id="practice-attempt"
                            fullWidth
                            multiline
                            minRows={6}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            helperText="Учебный SQL, имя таблицы, название графика и папка. Только синтетические данные. Код здесь не исполняется."
                            sx={{ "& .MuiInputBase-root": { bgcolor: t.bg }, "& .MuiFormHelperText-root": { mx: 0 } }}
                          />
                        </Box>
                        <Button
                          variant="contained"
                          disabled={busy || !answer.trim()}
                          sx={primaryBtn}
                          onClick={async () => {
                const signature = JSON.stringify([answer, p.task_version]);
                if (attemptKey.current?.signature !== signature) attemptKey.current = { signature, key: crypto.randomUUID() };
                const result = await run(`${path}/attempts`, { answer, task_version: p.task_version }, attemptKey.current.key);
                if (result !== undefined) attemptKey.current = null;
                          }}
                        >
                          Проверить попытку
                        </Button>
                      </Stack>
                    )}
                    <Typography variant="body2" color="text.secondary">Попыток: {p.attempts_count} из 3</Typography>
                    {last && (
                      <Box aria-label="Обратная связь по попытке" sx={{ p: `${space[4]}px`, bgcolor: last.review.passed ? t.okSoft : t.bg }}>
                        <Typography fontWeight={type.weight.semibold} color={last.review.passed ? "success.main" : "text.primary"} mb={`${space[2]}px`}>
                          {last.review.passed ? "Учебное задание пройдено" : "Есть что поправить"} · {last.review.score}%
                        </Typography>
                        <Stack gap={`${space[2]}px`}>
                          {last.review.checks.map((c) => (
                            <Box key={c.criterion}>
                              <Typography>{c.passed ? "✓" : "•"} {c.feedback}</Typography>
                              {c.sources?.map((id) => {
                                const s = p.sources.find((x) => x.page_id === id);
                                return s && (
                                  <Button key={id} variant="text" size="small" onClick={() => setSource(s)} sx={secondaryBtn}>{s.title}</Button>
                                );
                              })}
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                )}
                <Stack sx={actionsCol}>
                  {(passed || p.approval_expired) && (
                    <Button variant="contained" disabled={busy} onClick={() => advance("next")} sx={primaryBtn}>К реальной задаче</Button>
                  )}
                  <Button variant="text" disabled={busy} onClick={() => advance("skip_stage")} sx={{ ...secondaryBtn, alignSelf: { xs: "center", md: "flex-start" } }}>
                    Пропустить учебное задание
                  </Button>
                  {p.help_available && !sent && (
                    !draft ? (
                      <Button variant="text" disabled={busy} onClick={async () => {
                        const result = await run(`${path}/help-draft`, {});
                        if (result) setDraft(result as Draft);
                      }} sx={{ ...secondaryBtn, alignSelf: { xs: "center", md: "flex-start" } }}>
                        Спросить бадди
                      </Button>
                    ) : (
                      <Stack gap={`${space[2]}px`} sx={{ width: "100%" }}>
                        <Typography fontWeight={type.weight.semibold}>Черновик вопроса бадди</Typography>
                        <DraftCard
                          draft={draft}
                          login={login}
                          look={{ userName: () => "Бадди", systemTitle: (id) => id, stepTitle: () => p.step.title }}
                          onDone={(d) => { if (d?.status === "confirmed") setSent(true); else if (d?.status === "cancelled") setDraft(null); }}
                        />
                      </Stack>
                    )
                  )}
          {sent && <Alert severity="success">Вопрос отправлен бадди.</Alert>}
                </Stack>
              </Stack>
            )}

            {p.stage === "real_task" && (
              <Stack gap={`${space[4]}px`}>
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  gap={`${space[3]}px`}
                  sx={{ p: `${space[4]}px`, bgcolor: t.okSoft }}
                >
                  <Box aria-hidden sx={{ width: 10, height: 10, mt: "6px", flex: "none", bgcolor: brand.green }} />
                  <Box minWidth={0}>
                    <Typography fontWeight={type.weight.semibold} mb={`${space[1]}px`}>Практика пройдена</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Реальную задачу выполняешь отдельно — шаг плана автоматически не отмечается.
                    </Typography>
                  </Box>
                </Stack>

                <Stack gap={`${space[2]}px`}>
                  <Typography fontWeight={type.weight.semibold}>Чек-лист реальной задачи</Typography>
                  <Stack gap={`${space[2]}px`}>
                    {(p.checklist ?? []).map((c, i) => (
                      <Stack
                        key={c}
                        direction="row"
                        alignItems="flex-start"
                        gap={`${space[3]}px`}
                        sx={{ p: `${space[3]}px`, bgcolor: t.bg }}
                      >
                        <Box
                          aria-hidden
                          sx={{
                            width: 24,
                            height: 24,
                            flex: "none",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: t.folderSoft[i % t.folderSoft.length],
                            color: t.text,
                            fontSize: type.size.sm,
                            fontWeight: type.weight.bold,
                          }}
                        >
                          {i + 1}
                        </Box>
                        <Typography sx={{ pt: "2px", overflowWrap: "anywhere" }}>{c}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            )}

            {p.stage !== "real_task" && p.stage !== "offered" && (
              <Button variant="text" disabled={busy} onClick={() => advance("skip_all")} sx={{ ...secondaryBtn, alignSelf: { xs: "center", md: "flex-start" } }}>
                Сразу к реальной задаче
              </Button>
            )}
          </Stack>
        )}

        {p.sources.length > 0 && (buddy || p.stage !== "offered") && (
          <Stack gap={`${space[3]}px`} pt={{ xs: `${space[4]}px`, md: `${space[5]}px` }} borderTop={`${stroke.hairline}px solid ${t.line}`}>
            <Typography fontWeight={type.weight.semibold}>Источники команды</Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignContent: "flex-start",
                gap: `${space[2]}px`,
              }}
            >
              {p.sources.map((s, i) => (
                <Box
                  key={s.page_id}
                  component="button"
                  type="button"
                  onClick={() => setSource(s)}
                  sx={{
                    font: "inherit",
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    maxWidth: "100%",
                    minHeight: size.controlSm,
                    px: `${space[3]}px`,
                    py: `${space[2]}px`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: `${space[2]}px`,
                    bgcolor: t.folderSoft[i % t.folderSoft.length],
                    color: t.text,
                    fontWeight: type.weight.semibold,
                    fontSize: type.size.md,
                    lineHeight: type.line.snug,
                    "&:hover": { outline: `${stroke.thick}px solid ${t.text}` },
                    "&:focus-visible": { outline: `${stroke.thick}px solid ${t.link}` },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{ width: 8, height: 8, flex: "none", bgcolor: t.folderDot[i % t.folderDot.length] }}
                  />
                  {s.title}
                </Box>
              ))}
            </Box>
          </Stack>
        )}
    </Stack>

    <Dialog open={Boolean(source)} onClose={() => setSource(null)} fullWidth maxWidth="md">
        <DialogTitle sx={dialogTitleSx}>
          <Box component="span" sx={{ flex: 1, minWidth: 0, pr: 1 }}>{source?.title}</Box>
          <DialogClose onClose={() => setSource(null)} />
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={`${space[4]}px`}>{source?.author} · {source?.updated_at}</Typography>
          <Markdown text={source?.body ?? ""} />
        </DialogContent>
        <DialogActions sx={{ p: `${space[4]}px` }}>
          <Button variant="text" onClick={() => setSource(null)} sx={secondaryBtn}>Закрыть источник</Button>
        </DialogActions>
    </Dialog>
    </Block>
  );
};

export const PracticePanel = ({ login, buddy, revision, flush }: { login: string; buddy: boolean; revision: number; /** Без внешнего margin — когда панель уже в Stack с gap. */ flush?: boolean }) => {
  const { t, space } = useTheme();
  const [items, setItems] = useState<Practice[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const sequence = useRef(0);
  const refresh = async (signal: AbortSignal) => {
    const seq = ++sequence.current;
    const data = unwrap(await api<{ ok: boolean; data: Practice[] }>(login, "/api/practices", { signal }));
    if (active.current && !signal.aborted && sequence.current === seq) setItems(data);
  };
  useEffect(() => {
    active.current = true;
    const c = new AbortController(); controllers.current.add(c);
    void (async () => {
      setPreparing(true);
      try { await refresh(c.signal); await api(login, "/api/practices/sync", { method: "POST", body: "{}", signal: c.signal }); await refresh(c.signal); }
      catch (e) { if (active.current && !c.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось подготовить практику"); }
      finally { controllers.current.delete(c); if (active.current && !c.signal.aborted) setPreparing(false); }
    })();
    return () => { active.current = false; controllers.current.forEach((x) => x.abort()); controllers.current.clear(); };
    // Панель привязана к учётке через key: старые ответы при переключении отменяются.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);
  useEffect(() => {
    const c = new AbortController(); controllers.current.add(c);
    void refresh(c.signal).catch(() => undefined).finally(() => controllers.current.delete(c));
    return () => c.abort();
  }, [revision]);
  const run: Run = async (path, body, key) => {
    if (busy || !active.current) return;
    const c = new AbortController(); controllers.current.add(c); setBusy(true); setError("");
    try {
      const response = await api<{ ok?: boolean; data?: unknown }>(login, path, { method: "POST", body: JSON.stringify(body), signal: c.signal, headers: key ? { "Idempotency-Key": key } : {} });
      if (!active.current || c.signal.aborted) return;
      await refresh(c.signal);
      return response.data ?? response;
    } catch (e) { if (active.current && !c.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось выполнить действие"); }
    finally { controllers.current.delete(c); if (active.current && !c.signal.aborted) setBusy(false); }
  };
  if (!items.length && !preparing && !error) return null;
  return (
    <Stack gap={{ xs: 2, md: 5 }} mt={flush ? 0 : { xs: 2, md: 5 }}>
      {preparing && (
        <Stack gap={`${space[2]}px`}>
          <Typography color="text.secondary">Напарник готовит учебную практику…</Typography>
          <LinearProgress aria-label="Подготовка практики" sx={{ bgcolor: t.surface, "& .MuiLinearProgress-bar": { bgcolor: t.inverse } }} />
        </Stack>
      )}
    {error && <Alert severity="error" action={<Button onClick={() => void run("/api/practices/sync", {})}>Повторить</Button>}>{error}</Alert>}
    {items.map((p) => <PracticeCard key={`${p.intern_id}/${p.id}`} item={p} buddy={buddy} busy={busy} run={run} login={login} />)}
    </Stack>
  );
};
