// Карточка сотрудника (SCR-I5a, US-38): фото, ФИО, статус, должность, отдел, рабочие контакты.
// Своя карточка — загрузить или убрать фото, поправить телефон. ФИО, отдел и почта — из оргструктуры.
// Стиль — токены Akita: space 4-pt, type, stroke, surface/line/muted/link; без теней и скруглений (кроме фото).
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, InputAdornment, Link, Skeleton, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import { deletePhoto, fetchPhoto, getProfile, MAX_PHOTO_BYTES, updatePhone, uploadPhoto, type Profile } from "@/shared/api";
import { DialogBack, DialogClose, StatusTag } from "@/shared/ui";
import {
  formatLocal, isPhoneValid, normalizePhone, phoneDigits, phoneErrorMessage,
  PHONE_ERROR, PHONE_HINT, PHONE_SUCCESS,
} from "../lib/phone";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Object URL фото с заголовком X-User; освобождается при смене фото и размонтировании. */
export const usePhotoUrl = (login: string, url?: string | null) => {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    if (!url) return;
    const controller = new AbortController();
    let created: string | undefined;
    fetchPhoto(login, url, controller.signal).then((u) => { created = u; if (!controller.signal.aborted) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { controller.abort(); if (created) URL.revokeObjectURL(created); };
  }, [login, url]);
  return src;
};

/** Круг с фото или инициалами — заглушка, пока фото нет или оно грузится. */
export const ProfileAvatar = ({ login, photoUrl, initials, size = 32 }: { login: string; photoUrl?: string | null; initials: string; size?: number }) => {
  const { t } = useTheme();
  const src = usePhotoUrl(login, photoUrl);
  return <Avatar src={src} alt="" sx={{ width: size, height: size, fontSize: Math.round(size * 0.4), bgcolor: t.todaySoft, color: t.text }}>{initials}</Avatar>;
};

/** Уменьшает картинку до лимита бэкенда (512 КБ): длинная сторона до 1024 px, JPEG. Маленькие файлы — как есть. */
export const shrinkImage = async (file: File): Promise<Blob> => {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Фото — JPEG, PNG или WebP.");
  if (file.size <= MAX_PHOTO_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  for (const side of [1024, 768, 512]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  throw new Error("Не получилось уменьшить фото до 512 КБ — выбери другое.");
};

const dateRu = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Строка карточки: label + value, как list item Akita (gap 12, py 16, линия). */
const Field = ({ label, children }: { label: string; children: ReactNode }) => {
  const { t, space, stroke, type } = useTheme();
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      gap={{ xs: `${space[1]}px`, sm: `${space[3]}px` }}
      sx={{
        py: `${space[4]}px`,
        borderBottom: `${stroke.hairline}px solid ${t.line}`,
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Typography
        color="text.secondary"
        sx={{ width: { sm: 140 }, flex: "none", pt: { sm: `${space[1]}px` }, fontSize: type.size.md, lineHeight: type.line.normal }}
      >
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, flex: 1, overflowWrap: "anywhere", fontSize: type.size.base, lineHeight: type.line.normal }}>{children}</Box>
    </Stack>
  );
};

export type ProfileDialogProps = {
  open: boolean;
  login: string;
  /** ID сотрудника; без него — своя карточка. */
  userId?: string;
  onClose: () => void;
  /** На мобилке: вернуться на экран аккаунта вместо крестика. */
  onBack?: () => void;
  /** Своя карточка изменилась (фото, телефон) — например, обновить аватар в шапке. */
  onChanged?: (p: Profile) => void;
};

export const ProfileDialog = ({ open, login, userId, onClose, onBack, onChanged }: ProfileDialogProps) => {
  const theme = useTheme();
  const { t, space, stroke, type, size } = theme;
  /** Как экран «Аккаунт» в App — fullScreen ниже md. */
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState<string | null>(null); // null — не редактируем; иначе 10 цифр без +7
  const [phoneError, setPhoneError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const photo = usePhotoUrl(login, profile?.photo?.url);

  // Контрастные цвета для подсказок (brand.green / brand.red — только заливки, DESIGN.md)
  const okText = theme.palette.mode === "dark" ? "#7EE2A8" : "#0B6E3B";
  const errText = theme.palette.mode === "dark" ? "#FF8A96" : "#B42318";

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setProfile(null); setError(""); setPhone(null); setPhoneError("");
    getProfile(login, userId, { signal: controller.signal })
      .then((p) => { if (!controller.signal.aborted) setProfile(p); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Профиль недоступен"); });
    return () => controller.abort();
  }, [open, login, userId]);

  const apply = async (run: () => Promise<Profile>) => {
    setBusy(true); setError("");
    try { const p = await run(); setProfile(p); onChanged?.(p); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Не получилось"); return false; }
    finally { setBusy(false); }
  };

  const pickPhoto = async (f?: File) => {
    if (file.current) file.current.value = "";
    if (!f) return;
    await apply(async () => uploadPhoto(login, await shrinkImage(f)));
  };

  const beginPhoneEdit = () => {
    setPhone(phoneDigits(profile?.phone ?? ""));
    setPhoneError("");
  };

  const onPhoneChange = (raw: string) => {
    if (/[^\d\s+\-()]/.test(raw)) {
      setPhoneError(phoneErrorMessage(phoneDigits(raw), raw));
      setPhone(phoneDigits(raw));
      return;
    }
    const next = phoneDigits(raw);
    setPhone(next);
    setPhoneError(next.length === 10 ? phoneErrorMessage(next) : "");
  };

  const savePhone = async () => {
    if (phone === null) return;
    const err = phoneErrorMessage(phone);
    if (err) { setPhoneError(err); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { setPhoneError(PHONE_ERROR); return; }
    setPhoneError("");
    setBusy(true);
    try { const p = await updatePhone(login, normalized); setProfile(p); onChanged?.(p); setPhone(null); }
    catch (e) { setPhoneError(e instanceof Error ? e.message : PHONE_ERROR); }
    finally { setBusy(false); }
  };

  const phoneOk = phone !== null && isPhoneValid(phone);
  // «Успешно валидирован» — только когда номер изменили; при открытии правки с прежним номером — подсказка формата.
  const phoneChanged = phone !== null && phone !== phoneDigits(profile?.phone ?? "");
  const phoneHelp = phoneError || (phoneOk && phoneChanged ? PHONE_SUCCESS : PHONE_HINT);
  const phoneHelpColor = phoneError ? errText : phoneOk && phoneChanged ? okText : t.muted;

  const intern = profile?.status === "Стажёр";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={mobile}
      aria-labelledby="profile-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 0,
            border: mobile ? "none" : `${stroke.thick}px solid ${t.line}`,
            boxShadow: "none",
            display: "flex",
            flexDirection: "column",
            ...(!mobile && { height: size.dialog, maxHeight: size.dialog }),
          },
        },
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={1}
        sx={{
          pl: onBack ? `${space[4]}px` : `${space[6]}px`,
          pr: `${space[4]}px`,
          pt: `${space[5]}px`,
          pb: `${space[2]}px`,
          flex: "none",
          ...(mobile && { position: "sticky", top: 0, zIndex: 1, bgcolor: t.bg, borderBottom: `1px solid ${t.line}` }),
        }}
      >
        <Stack direction="row" alignItems="center" gap={1} minWidth={0} flex={1}>
          {onBack && <DialogBack onBack={onBack} label="Назад к аккаунту" />}
          <Typography
            id="profile-title"
            fontWeight={type.weight.semibold}
            fontSize={type.size.h2}
            lineHeight={type.line.snug}
            sx={{ minWidth: 0 }}
          >
            {profile?.can_edit ? "Мой профиль" : "Профиль сотрудника"}
          </Typography>
        </Stack>
        {!onBack && <DialogClose onClose={onClose} />}
      </Stack>
      <DialogContent sx={{
        px: `${space[6]}px`,
        pt: `${space[2]}px`,
        pb: `${space[6]}px`,
        flex: "1 1 auto",
        minHeight: 0,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}>
        {error && <Alert severity="error" sx={{ mb: `${space[4]}px`, borderRadius: 0 }}>{error}</Alert>}
        {!profile ? (!error && <Stack direction="row" gap={`${space[5]}px`} alignItems="center" aria-label="Загрузка профиля">
          <Skeleton variant="circular" width={96} height={96} />
          <Box flex={1}><Skeleton width="70%" height={32} /><Skeleton width="40%" /></Box>
        </Stack>) : <>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            gap={`${space[5]}px`}
            alignItems={{ xs: "flex-start", sm: "center" }}
            sx={{ mb: `${space[6]}px` }}
          >
            <Avatar
              src={photo}
              alt={profile.photo ? `Фото: ${profile.name}` : ""}
              sx={{ width: 96, height: 96, fontSize: 34, bgcolor: t.todaySoft, color: t.text }}
            >
              {profile.initials}
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="h2" component="h2" sx={{ textWrap: "balance" }}>{profile.name}</Typography>
              <Stack direction="row" gap={`${space[2]}px`} alignItems="center" flexWrap="wrap" sx={{ mt: `${space[2]}px` }}>
                <StatusTag status={intern ? "Today" : "neutral"} label={profile.status} />
                <Typography variant="body2" color="text.secondary">{profile.position}</Typography>
              </Stack>
              {profile.can_edit && <Stack direction="row" gap={`${space[2]}px`} sx={{ mt: `${space[4]}px` }} flexWrap="wrap">
                <Button variant="outlined" size="small" disabled={busy} onClick={() => file.current?.click()}>{profile.photo ? "Сменить фото" : "Загрузить фото"}</Button>
                {profile.photo && <Button variant="text" size="small" disabled={busy} onClick={() => void apply(() => deletePhoto(login))}>Убрать фото</Button>}
                <input ref={file} type="file" hidden accept={PHOTO_TYPES.join(",")} data-testid="photo-input" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              </Stack>}
            </Box>
          </Stack>

          <Box sx={{ bgcolor: t.surface, px: { xs: `${space[4]}px`, md: `${space[6]}px` }, py: `${space[2]}px` }}>
            <Field label="Отдел">{profile.department}</Field>
            <Field label="Телефон">
              {phone === null ? <Stack direction="row" gap={`${space[3]}px`} alignItems="baseline" flexWrap="wrap">
                {profile.phone
                  ? <Link href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} color="inherit" underline="hover">{profile.phone}</Link>
                  : <Typography color="text.secondary">не указан</Typography>}
                {profile.can_edit && (
                  <Link component="button" variant="body2" underline="hover" onClick={beginPhoneEdit} sx={{ color: t.link }}>
                    Изменить
                  </Link>
                )}
              </Stack> : <Stack gap={`${space[3]}px`}>
                <Box>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    placeholder="999 123-45-67"
                    value={formatLocal(phone)}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    onBlur={() => { if (phone !== null && phone.length > 0) setPhoneError(phoneErrorMessage(phone)); }}
                    error={Boolean(phoneError)}
                    inputProps={{
                      inputMode: "numeric",
                      pattern: "[0-9]*",
                      maxLength: 13,
                      "aria-label": "Рабочий телефон",
                      autoComplete: "tel-national",
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ mr: `${space[1]}px`, "& .MuiTypography-root": { fontWeight: type.weight.semibold, color: t.text } }}>
                          +7
                        </InputAdornment>
                      ),
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void savePhone();
                      if (e.key === "Escape") { e.stopPropagation(); setPhone(null); setPhoneError(""); }
                      if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        setPhoneError(phoneErrorMessage(phone, e.key));
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      onPhoneChange(phone + e.clipboardData.getData("text"));
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        bgcolor: t.bg,
                        minHeight: size.controlSm,
                      },
                      "& .MuiOutlinedInput-root.Mui-focused": {
                        outline: `${stroke.thick}px solid ${t.text}`,
                        outlineOffset: 0,
                      },
                      "& .MuiOutlinedInput-root.Mui-error": {
                        outline: `${stroke.thick}px solid ${errText}`,
                        outlineOffset: 0,
                      },
                      "& .MuiOutlinedInput-root.Mui-error.Mui-focused": {
                        outline: `${stroke.thick}px solid ${errText}`,
                        outlineOffset: 0,
                      },
                    }}
                  />
                  {/* Свой helper — без mx MUI, строго по левому краю инпута */}
                  <Typography
                    component="p"
                    sx={{
                      m: 0,
                      mt: `${space[2]}px`,
                      fontSize: type.size.sm,
                      lineHeight: type.line.normal,
                      color: phoneHelpColor,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {phoneHelp}
                  </Typography>
                </Box>
                <Stack direction="row" gap={`${space[2]}px`}>
                  <Button variant="contained" size="small" disabled={busy || !phoneOk} onClick={() => void savePhone()}>Сохранить</Button>
                  <Button variant="text" size="small" disabled={busy} onClick={() => { setPhone(null); setPhoneError(""); }}>Отмена</Button>
                </Stack>
              </Stack>}
            </Field>
            <Field label="Почта">
              {profile.email
                ? <Link href={`mailto:${profile.email}`} color="inherit" underline="hover">{profile.email}</Link>
                : <Typography color="text.secondary">не указана</Typography>}
            </Field>
            {intern && <>
              {profile.start_date && <Field label="Старт стажировки">{dateRu(profile.start_date)}{profile.week ? ` · ${profile.week}-я неделя` : ""}</Field>}
              {profile.buddy && <Field label="Бадди">{profile.buddy}</Field>}
              {profile.lead && <Field label="Руководитель">{profile.lead}</Field>}
            </>}
          </Box>
          {profile.can_edit && (
            <Typography
              color="text.secondary"
              sx={{ display: "block", mt: `${space[4]}px`, fontSize: type.size.sm, lineHeight: type.line.normal }}
            >
              ФИО, должность, отдел и почта — из оргструктуры. Фото — JPEG, PNG или WebP.
            </Typography>
          )}
        </>}
      </DialogContent>
      {mobile && (
        <DialogActions sx={{ p: `${space[4]}px` }}>
          <Button variant="contained" fullWidth onClick={onClose}>Готово</Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
