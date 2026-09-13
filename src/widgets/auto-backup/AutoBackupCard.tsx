import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import RestoreIcon from "@mui/icons-material/Restore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Capacitor } from "@capacitor/core";
import { settingsApi } from "../../shared/api/settingsApi";
import { extractErrorMessage } from "../../shared/api/client";
import { useToast } from "../../shared/components/ToastProvider";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { backupService, type AutoBackupInfo } from "../../core/services/backupService";

const INTERVAL_OPTIONS = [
  { label: "هر ۶ ساعت", hours: 6 },
  { label: "هر ۱۲ ساعت", hours: 12 },
  { label: "روزانه (۲۴ ساعت)", hours: 24 },
  { label: "هر ۳ روز", hours: 72 },
  { label: "هفتگی", hours: 168 },
];

const VERSION_OPTIONS = [3, 5, 7, 10, 15];

// شناسه بستهٔ اندروید اپ (از capacitor.config.ts) — برای نمایش دقیق مسیر
// پوشهٔ بکاپ قابل‌مشاهده به کاربر، بدون نیاز به import مستقیم فایل کانفیگ.
const APP_PACKAGE_ID = "ir.karegahyar.app";

function formatDateTimeFa(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * آیا از آخرین بکاپ خودکار موفق، بیش از حد معمول گذشته (۲ برابر فاصلهٔ
 * تنظیم‌شده)؟ این یعنی چند بار متوالی اجرای بکاپ یا رد شده یا شکست خورده،
 * بدون این‌که لزوماً خطای صریحی هم ثبت شده باشد (مثلاً چون مدتی برنامه اصلاً
 * باز نشده). صرفاً یک هشدار محافظه‌کارانه است، نه تشخیص قطعی خرابی.
 */
function isAutoBackupOverdue(settings: {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastAutoBackupAt?: string;
}): boolean {
  if (!settings.autoBackupEnabled) return false;
  if (!settings.lastAutoBackupAt) return false;
  const intervalMs = settings.autoBackupIntervalHours * 60 * 60 * 1000;
  const last = new Date(settings.lastAutoBackupAt).getTime();
  if (isNaN(last)) return false;
  return Date.now() - last > intervalMs * 2;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} بایت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} کیلوبایت`;
  return `${(kb / 1024).toFixed(1)} مگابایت`;
}

export function AutoBackupCard() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isNative = Capacitor.isNativePlatform();

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
  });

  const { data: autoBackups = [], isLoading: isLoadingList } = useQuery({
    queryKey: ["auto-backups"],
    queryFn: () => backupService.listAutoBackups(),
    enabled: isNative,
  });

  const [restoreTarget, setRestoreTarget] = useState<AutoBackupInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutoBackupInfo | null>(null);
  const [isRunningNow, setIsRunningNow] = useState(false);

  const updateAutoBackupMutation = useMutation({
    mutationFn: (input: {
      autoBackupEnabled: boolean;
      autoBackupIntervalHours: number;
      autoBackupMaxVersions: number;
    }) => settingsApi.updateAutoBackupSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      showToast("تنظیمات بکاپ خودکار ذخیره شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const restoreMutation = useMutation({
    mutationFn: (fileName: string) => backupService.restoreFromAutoBackup(fileName),
    onSuccess: () => {
      showToast("بازیابی با موفقیت انجام شد. برنامه دوباره بارگذاری می‌شود...", "success");
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
    onSettled: () => setRestoreTarget(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileName: string) => backupService.deleteAutoBackup(fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-backups"] });
      showToast("بکاپ حذف شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
    onSettled: () => setDeleteTarget(null),
  });

  if (!isNative) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <HistoryIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              بکاپ خودکار دوره‌ای
            </Typography>
          </Stack>
          <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
            بکاپ خودکار داخلی فقط در نسخهٔ نصب‌شده روی اندروید فعال است. در مرورگر، از گزینهٔ
            «دانلود فایل پشتیبان» بالا استفاده کنید.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  async function handleRunNow() {
    try {
      setIsRunningNow(true);
      await backupService.createAutoBackup();
      queryClient.invalidateQueries({ queryKey: ["auto-backups"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      showToast("بکاپ داخلی جدید ساخته شد.", "success");
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setIsRunningNow(false);
    }
  }

  return (
    <>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <HistoryIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              بکاپ خودکار دوره‌ای
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            علاوه بر بکاپ دستی، اپ می‌تواند به‌صورت خودکار و بدون دخالت شما، نسخه‌های پشتیبان
            را داخل حافظهٔ خودش نگه دارد تا در صورت کرش یا بسته‌شدن ناگهانی، اطلاعات از دست
            نرود. این کار کاملاً آفلاین انجام می‌شود.
          </Typography>

          <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={700} gutterBottom>
              فایل‌های بکاپ خودکار دقیقاً کجا ذخیره می‌شوند؟
            </Typography>
            <Typography variant="body2" component="div">
              هر بار بکاپ خودکار در <strong>دو نسخه</strong> همزمان ذخیره می‌شود:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, mt: 0.5 }}>
              <li>
                <Typography variant="body2">
                  <strong>نسخهٔ داخلی (خصوصی اپ)</strong> — در حافظهٔ اختصاصی برنامه، غیرقابل مشاهده با
                  فایل‌منیجر گوشی. همین نسخه در فهرست زیر برای «بازیابی سریع» قابل انتخاب است.
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  <strong>نسخهٔ قابل‌مشاهده</strong> — در مسیر{" "}
                  <Typography component="code" variant="body2" sx={{ fontFamily: "monospace" }}>
                    Android/data/{APP_PACKAGE_ID}/files/KaregahYar/backups
                  </Typography>{" "}
                  در حافظهٔ گوشی، که با هر برنامهٔ فایل‌منیجر قابل دیدن و کپی‌کردن است (مثلاً برای انتقال
                  به گوشی دیگر یا آپلود در گوگل‌درایو). نسخه‌های قدیمی‌تر از ۱۵ روز از این مسیر به‌صورت
                  خودکار پاک می‌شوند.
                </Typography>
              </li>
            </Box>
          </Alert>

          {isLoadingSettings ? (
            <CircularProgress size={20} />
          ) : (
            settings && (
              <Stack spacing={2}>
                {settings.lastAutoBackupErrorMessage && (
                  <Alert severity="error" variant="outlined">
                    <Typography variant="body2" fontWeight={700} gutterBottom>
                      آخرین تلاش برای بکاپ خودکار ناموفق بود
                      {settings.lastAutoBackupErrorAt && ` (${formatDateTimeFa(settings.lastAutoBackupErrorAt)})`}
                    </Typography>
                    <Typography variant="body2">{settings.lastAutoBackupErrorMessage}</Typography>
                  </Alert>
                )}

                {!settings.lastAutoBackupErrorMessage && isAutoBackupOverdue(settings) && (
                  <Alert severity="warning" variant="outlined">
                    مدتی طولانی‌تر از حد معمول از آخرین بکاپ خودکار موفق گذشته. با دکمهٔ «ساخت بکاپ داخلی
                    همین حالا» زیر یک نسخهٔ تازه بسازید و مطمئن شوید همه‌چیز درست کار می‌کند.
                  </Alert>
                )}

                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.autoBackupEnabled}
                      onChange={(e) =>
                        updateAutoBackupMutation.mutate({
                          autoBackupEnabled: e.target.checked,
                          autoBackupIntervalHours: settings.autoBackupIntervalHours,
                          autoBackupMaxVersions: settings.autoBackupMaxVersions,
                        })
                      }
                    />
                  }
                  label="بکاپ‌گیری خودکار فعال باشد"
                />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    select
                    label="فاصلهٔ زمانی بکاپ"
                    value={settings.autoBackupIntervalHours}
                    disabled={!settings.autoBackupEnabled}
                    onChange={(e) =>
                      updateAutoBackupMutation.mutate({
                        autoBackupEnabled: settings.autoBackupEnabled,
                        autoBackupIntervalHours: Number(e.target.value),
                        autoBackupMaxVersions: settings.autoBackupMaxVersions,
                      })
                    }
                    fullWidth
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <MenuItem key={opt.hours} value={opt.hours}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="تعداد نسخه‌های نگه‌داشته‌شده"
                    value={settings.autoBackupMaxVersions}
                    disabled={!settings.autoBackupEnabled}
                    onChange={(e) =>
                      updateAutoBackupMutation.mutate({
                        autoBackupEnabled: settings.autoBackupEnabled,
                        autoBackupIntervalHours: settings.autoBackupIntervalHours,
                        autoBackupMaxVersions: Number(e.target.value),
                      })
                    }
                    fullWidth
                  >
                    {VERSION_OPTIONS.map((v) => (
                      <MenuItem key={v} value={v}>
                        {v} نسخهٔ آخر
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                {settings.lastAutoBackupAt && (
                  <Typography variant="caption" color="text.secondary">
                    آخرین بکاپ خودکار: {formatDateTimeFa(settings.lastAutoBackupAt)}
                  </Typography>
                )}

                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleRunNow}
                  disabled={isRunningNow}
                  startIcon={isRunningNow ? <CircularProgress size={16} /> : undefined}
                  sx={{ alignSelf: "flex-start" }}
                >
                  ساخت بکاپ داخلی همین حالا
                </Button>
              </Stack>
            )
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" fontWeight={700} mb={1}>
            نسخه‌های پشتیبان ذخیره‌شده
          </Typography>

          {isLoadingList && <CircularProgress size={18} />}

          {!isLoadingList && autoBackups.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              هنوز هیچ بکاپ خودکاری ساخته نشده است.
            </Typography>
          )}

          {!isLoadingList && autoBackups.length > 0 && (
            <List dense disablePadding>
              {autoBackups.map((b, idx) => (
                <ListItem
                  key={b.fileName}
                  divider={idx < autoBackups.length - 1}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        edge="end"
                        size="small"
                        color="primary"
                        onClick={() => setRestoreTarget(b)}
                        aria-label="بازیابی"
                      >
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        size="small"
                        color="error"
                        onClick={() => setDeleteTarget(b)}
                        aria-label="حذف"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">{formatDateTimeFa(b.createdAt)}</Typography>
                        {idx === 0 && <Chip label="جدیدترین" size="small" color="primary" />}
                      </Stack>
                    }
                    secondary={formatSize(b.sizeBytes) || undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Box mt={2}>
            <Alert severity="info" variant="outlined">
              فایل‌های داخلی (بالا) برای بازیابی سریع در همین اپ هستند. برای انتقال به گوشی دیگر یا
              آپلود در فضای ابری، از نسخهٔ قابل‌مشاهده در مسیر یادشده در بالا، یا از «دانلود فایل
              پشتیبان» در بخش قبلی استفاده کنید.
            </Alert>
          </Box>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!restoreTarget}
        title="بازیابی از این بکاپ؟"
        description={
          restoreTarget
            ? `تمام اطلاعات فعلی برنامه با محتوای بکاپ مربوط به ${formatDateTimeFa(
                restoreTarget.createdAt
              )} جایگزین می‌شود. این عملیات قابل بازگشت نیست.`
            : ""
        }
        confirmLabel="بازیابی"
        confirmColor="warning"
        loading={restoreMutation.isPending}
        onConfirm={() => restoreTarget && restoreMutation.mutate(restoreTarget.fileName)}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف این بکاپ؟"
        description={
          deleteTarget
            ? `بکاپ مربوط به ${formatDateTimeFa(deleteTarget.createdAt)} برای همیشه حذف می‌شود.`
            : ""
        }
        confirmLabel="حذف"
        confirmColor="error"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.fileName)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
