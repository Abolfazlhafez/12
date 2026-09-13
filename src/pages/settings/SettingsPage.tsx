import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import LanguageIcon from "@mui/icons-material/Language";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Capacitor } from "@capacitor/core";
import { settingsApi } from "../../shared/api/settingsApi";
import { extractErrorMessage } from "../../shared/api/client";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorState } from "../../shared/components/ErrorState";
import { useToast } from "../../shared/components/ToastProvider";
import { formatCurrency, toPlainDigitsOnly } from "../../shared/utils/format";
import { backupService } from "../../core/services/backupService";
import { AutoBackupCard } from "../../widgets/auto-backup/AutoBackupCard";
import { CloudBackupCard } from "../../widgets/cloud-backup/CloudBackupCard";
import { NotificationSettingsCard } from "../../widgets/notification-settings/NotificationSettingsCard";
import { ProjectsSettingsCard } from "../../widgets/layout/ProjectsSettingsCard";
import { useThemeMode, ThemeModePreference } from "../../shared/hooks/useThemeMode";
import { useLanguage } from "../../shared/hooks/useLanguage";
import { LANGUAGE_LIST } from "../../shared/i18n/languages";
import { CURRENCIES } from "../../shared/i18n/languages";

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { preference, setPreference } = useThemeMode();
  const { language, setLanguage, currency, setCurrency } = useLanguage();

  const THEME_OPTIONS: { value: ThemeModePreference; label: string; icon: ReactNode }[] = [
    { value: "light", label: "روشن", icon: <LightModeIcon fontSize="small" /> },
    { value: "dark", label: "تاریک", icon: <DarkModeIcon fontSize="small" /> },
    { value: "system", label: "خودکار (پیرو گوشی)", icon: <BrightnessAutoIcon fontSize="small" /> },
  ];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
  });

  const [hours, setHours] = useState("8");
  const [sampleSalary, setSampleSalary] = useState("1000000");
  const [quickCheckInTime, setQuickCheckInTime] = useState("08:00");
  const [customQuickCheckInTime, setCustomQuickCheckInTime] = useState("");
  const [quickCheckOutTime, setQuickCheckOutTime] = useState("17:00");
  const [customQuickCheckOutTime, setCustomQuickCheckOutTime] = useState("");

  // مقادیر فرم برای بازهٔ پیش‌فرض «صبحانه سریع»/«ناهار سریع». رشتهٔ خالی
  // یعنی «تنظیم‌نشده» (null در سرور) — یعنی دکمهٔ سریع سراغ سابقهٔ خودِ
  // نیرو می‌رود.
  const [breakfastStart, setBreakfastStart] = useState("");
  const [breakfastEnd, setBreakfastEnd] = useState("");
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");

  useEffect(() => {
    if (data) {
      setHours(String(data.standardWorkHoursPerDay));
      setQuickCheckInTime(data.quickCheckInDefaultTime);
      setQuickCheckOutTime(data.quickCheckOutDefaultTime);
      setBreakfastStart(data.quickBreakfastDefaultStartTime ?? "");
      setBreakfastEnd(data.quickBreakfastDefaultEndTime ?? "");
      setLunchStart(data.quickLunchDefaultStartTime ?? "");
      setLunchEnd(data.quickLunchDefaultEndTime ?? "");
    }
  }, [data]);

  const QUICK_CHECKIN_PRESETS = ["07:30", "08:00", "08:15", "08:30"];
  const QUICK_CHECKOUT_PRESETS = ["16:00", "16:30", "17:00", "17:30"];

  const updateQuickCheckInMutation = useMutation({
    mutationFn: (time: string) =>
      settingsApi.updateQuickCheckInSettings({
        quickCheckInDefaultTime: time,
        quickCheckOutDefaultTime: quickCheckOutTime,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setQuickCheckInTime(updated.quickCheckInDefaultTime);
      showToast("ساعت پیش‌فرض ورود سریع به‌روزرسانی شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const updateQuickCheckOutMutation = useMutation({
    mutationFn: (time: string) =>
      settingsApi.updateQuickCheckInSettings({
        quickCheckInDefaultTime: quickCheckInTime,
        quickCheckOutDefaultTime: time,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setQuickCheckOutTime(updated.quickCheckOutDefaultTime);
      showToast("ساعت پیش‌فرض خروج سریع به‌روزرسانی شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const updateQuickBreakMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateQuickBreakSettings({
        quickBreakfastDefaultStartTime: breakfastStart || null,
        quickBreakfastDefaultEndTime: breakfastEnd || null,
        quickLunchDefaultStartTime: lunchStart || null,
        quickLunchDefaultEndTime: lunchEnd || null,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setBreakfastStart(updated.quickBreakfastDefaultStartTime ?? "");
      setBreakfastEnd(updated.quickBreakfastDefaultEndTime ?? "");
      setLunchStart(updated.quickLunchDefaultStartTime ?? "");
      setLunchEnd(updated.quickLunchDefaultEndTime ?? "");
      showToast("ساعت پیش‌فرض صبحانه/ناهار سریع به‌روزرسانی شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: (h: number) => settingsApi.update({ standardWorkHoursPerDay: h }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["daily-report"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      showToast("تنظیمات با موفقیت ذخیره شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  function handleSave() {
    const h = Number(hours);
    if (!h || h <= 0 || h > 24) {
      showToast("ساعت کاری باید بین ۰ تا ۲۴ باشد.", "error");
      return;
    }
    updateMutation.mutate(h);
  }

  const hourlyRatePreview =
    Number(hours) > 0 ? Math.round(Number(sampleSalary) / Number(hours)) : 0;

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  // فایلی که کاربر انتخاب کرده ولی معلوم شد رمزدار است — منتظر وارد کردن
  // رمز عبور می‌ماند تا با آن دوباره تلاش شود.
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  // خطای مربوط به تلاش رمز عبور (مثلاً رمز اشتباه) همین‌جا و کنار کادر رمز
  // نشان داده می‌شود — نه فقط به‌صورت یک toast گذرا — چون toast ممکن است
  // قبل از این‌که کاربر کامل بخواندش بسته شود و او را سردرگم نگه دارد که
  // آیا اصلاً دوباره تلاش کند یا باید از اول فایل را انتخاب کند.
  const [importPasswordError, setImportPasswordError] = useState<string | null>(null);

  async function handleExport() {
    try {
      setIsExporting(true);
      await backupService.exportAndShare(exportPassword.trim() || undefined);
      showToast(
        Capacitor.isNativePlatform() ? "فایل پشتیبان آماده شد. آن را ذخیره یا اشتراک بگذارید." : "پشتیبان با موفقیت دانلود شد.",
        "success"
      );
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    } finally {
      setIsExporting(false);
    }
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  async function runImport(file: File, password?: string) {
    try {
      setIsImporting(true);
      setImportPasswordError(null);
      await backupService.importAll(file, password);
      setPendingImportFile(null);
      setImportPassword("");
      setImportPasswordError(null);
      showToast("بازیابی با موفقیت انجام شد. برنامه دوباره بارگذاری می‌شود...", "success");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      const message = extractErrorMessage(err);
      // اگر خطا دقیقاً به‌خاطر نبودِ رمز عبور بود، به‌جای پیام خطای ساده،
      // از کاربر بخواه رمز را وارد کند (به‌جای این‌که مجبور شود دوباره از
      // اول فایل را انتخاب کند).
      if (message.includes("رمز عبور محافظت شده")) {
        setPendingImportFile(file);
      } else if (pendingImportFile || password !== undefined) {
        // این تلاش، تلاش برای واردکردن رمز عبور بود (نه انتخاب اولیهٔ
        // فایل) — یعنی به‌احتمال زیاد رمز اشتباه بوده. فایل انتخاب‌شده را
        // نگه می‌داریم تا کاربر مجبور نشود دوباره از فایل‌منیجر انتخابش
        // کند، و پیام خطا را دقیقاً کنار همان کادر رمز نشان می‌دهیم.
        setPendingImportFile(file);
        setImportPasswordError(message);
      } else {
        showToast(message, "error");
      }
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const confirmed = window.confirm(
      "بازیابی از پشتیبان، تمام اطلاعات فعلی برنامه را پاک و جایگزین می‌کند. ادامه می‌دهید؟"
    );
    if (!confirmed) return;

    await runImport(file);
  }

  async function handleSubmitImportPassword() {
    if (!pendingImportFile) return;
    await runImport(pendingImportFile, importPassword);
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <SettingsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          {t("settings.title")}
        </Typography>
      </Stack>

      <ProjectsSettingsCard />

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <LanguageIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700}>
              {t("settings.languageSection.title")}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t("settings.languageSection.description")}
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              select
              fullWidth
              size="small"
              label={t("settings.languageSection.languageLabel")}
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              {LANGUAGE_LIST.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              size="small"
              label={t("settings.languageSection.currencyLabel")}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as typeof currency)}
            >
              {Object.values(CURRENCIES).map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {t(c.labelKey)} ({c.symbol})
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
            حالت نمایش
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            بین حالت روشن، تاریک یا پیروی خودکار از تنظیم گوشی انتخاب کنید.
          </Typography>
          <Stack direction="row" spacing={1}>
            {THEME_OPTIONS.map((opt) => {
              const selected = preference === opt.value;
              return (
                <Button
                  key={opt.value}
                  onClick={() => setPreference(opt.value)}
                  variant={selected ? "contained" : "outlined"}
                  startIcon={opt.icon}
                  fullWidth
                  sx={{ flexDirection: "column", gap: 0.25, py: 1 }}
                >
                  {opt.label}
                </Button>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* کارت «شغل‌ها و دستمزد» از اینجا حذف شد — طبق ادغام منوها، این
          میان‌بر حالا مستقیماً کنار فهرست نیروها (صفحهٔ «تیم و تجهیزات»،
          تب نیروها) است، چون کاربردش فقط برای همان‌جاست و کاربر مجبور
          نیست برای رسیدن بهش اول یاد بگیرد که باید بیاید تنظیمات. */}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
            ثبت حضور سریع
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            ساعت پیش‌فرض ورود و خروج برای «ثبت سریع» حضور — فقط برای نیروهایی استفاده می‌شود که سابقهٔ
            حضور قبلی یا شیفت ثابت اختصاصی ندارند (یا سابقهٔ آن‌ها فقط یک طرف را دارد).
          </Typography>

          <Typography variant="body2" fontWeight={600} mb={1}>
            ساعت ورود
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
            {QUICK_CHECKIN_PRESETS.map((preset) => (
              <Button
                key={preset}
                onClick={() => updateQuickCheckInMutation.mutate(preset)}
                variant={quickCheckInTime === preset ? "contained" : "outlined"}
                size="small"
                disabled={updateQuickCheckInMutation.isPending}
              >
                {preset}
              </Button>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <TextField
              label="ساعت ورود دلخواه"
              type="time"
              value={customQuickCheckInTime}
              onChange={(e) => setCustomQuickCheckInTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <Button
              onClick={() => {
                if (!customQuickCheckInTime) return;
                updateQuickCheckInMutation.mutate(customQuickCheckInTime);
                setCustomQuickCheckInTime("");
              }}
              variant="outlined"
              size="small"
              disabled={updateQuickCheckInMutation.isPending || !customQuickCheckInTime}
            >
              ثبت
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2.5 }}>
            ساعت ورود فعلی: {quickCheckInTime}
          </Typography>

          <Typography variant="body2" fontWeight={600} mb={1}>
            ساعت خروج
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
            {QUICK_CHECKOUT_PRESETS.map((preset) => (
              <Button
                key={preset}
                onClick={() => updateQuickCheckOutMutation.mutate(preset)}
                variant={quickCheckOutTime === preset ? "contained" : "outlined"}
                size="small"
                disabled={updateQuickCheckOutMutation.isPending}
              >
                {preset}
              </Button>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              label="ساعت خروج دلخواه"
              type="time"
              value={customQuickCheckOutTime}
              onChange={(e) => setCustomQuickCheckOutTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <Button
              onClick={() => {
                if (!customQuickCheckOutTime) return;
                updateQuickCheckOutMutation.mutate(customQuickCheckOutTime);
                setCustomQuickCheckOutTime("");
              }}
              variant="outlined"
              size="small"
              disabled={updateQuickCheckOutMutation.isPending || !customQuickCheckOutTime}
            >
              ثبت
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            ساعت خروج فعلی: {quickCheckOutTime}
          </Typography>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
            صبحانه سریع / ناهار سریع
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            اگر این‌جا ساعت مشخص کنید، دکمهٔ «سریع» همیشه از همین استفاده می‌کند. اگر
            خالی بگذارید، دکمهٔ «سریع» ساعتِ آخرین ثبتِ همان نیرو را پیشنهاد می‌دهد؛ اگر آن
            هم نبود، فرم ثبت دستی باز می‌شود.
          </Typography>

          <Typography variant="body2" fontWeight={600} mb={1}>
            صبحانه
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <TextField
              label="ساعت شروع"
              type="time"
              value={breakfastStart}
              onChange={(e) => setBreakfastStart(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="ساعت پایان"
              type="time"
              value={breakfastEnd}
              onChange={(e) => setBreakfastEnd(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Typography variant="body2" fontWeight={600} mb={1}>
            ناهار
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <TextField
              label="ساعت شروع"
              type="time"
              value={lunchStart}
              onChange={(e) => setLunchStart(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="ساعت پایان"
              type="time"
              value={lunchEnd}
              onChange={(e) => setLunchEnd(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => updateQuickBreakMutation.mutate()}
              variant="contained"
              size="small"
              disabled={updateQuickBreakMutation.isPending}
            >
              ذخیره
            </Button>
            <Button
              onClick={() => {
                setBreakfastStart("");
                setBreakfastEnd("");
                setLunchStart("");
                setLunchEnd("");
                updateQuickBreakMutation.mutate();
              }}
              variant="text"
              color="inherit"
              size="small"
              disabled={updateQuickBreakMutation.isPending}
            >
              پاک کردن پیش‌فرض‌ها
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />}

      {data && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
              ساعت کاری استاندارد روزانه
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              این عدد برای تبدیل حقوق پایه روزانه به نرخ ساعتی استفاده می‌شود. برای مثال اگر
              حقوق پایه روزانه ۱ میلیون تومان و ساعت کاری استاندارد ۸ ساعت باشد، نرخ ساعتی
              ۱۲۵,۰۰۰ تومان محاسبه می‌شود.
            </Typography>

            <Stack spacing={2}>
              <TextField
                label="ساعت کاری استاندارد (ساعت در روز)"
                value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
              />

              <Alert severity="info" variant="outlined">
                با تغییر این مقدار، محاسبه حقوق همه نیروها از این پس بر اساس عدد جدید انجام
                می‌شود. زمان استراحت مجاز (صبحانه/ناهار) در هیچ حالتی از حقوق کسر نمی‌گردد.
              </Alert>

              <Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                  پیش‌نمایش: با حقوق پایه روزانه
                </Typography>
                <TextField
                  size="small"
                  value={sampleSalary}
                  onChange={(e) => setSampleSalary(toPlainDigitsOnly(e.target.value))}
                  inputMode="numeric"
                  sx={{ maxWidth: 220 }}
                />
                <Typography variant="body2" mt={1}>
                  نرخ ساعتی محاسبه‌شده:{" "}
                  <strong>{formatCurrency(hourlyRatePreview)}</strong> در ساعت
                </Typography>
              </Box>

              <Button
                variant="contained"
                size="large"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                ذخیره تنظیمات
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
            پشتیبان‌گیری و بازیابی
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            چون این برنامه کاملاً آفلاین است و اطلاعات فقط روی همین گوشی ذخیره می‌شود، برای
            جلوگیری از از دست رفتن اطلاعات (مثلاً هنگام تعویض گوشی) به‌صورت دوره‌ای از این گزینه
            برای دانلود فایل پشتیبان استفاده کنید. فایل پشتیبان همیشه رمزنگاری‌شده ذخیره می‌شود؛
            باز کردن مستقیم آن (مثلاً با یک ویرایشگر متن) اطلاعات را نشان نمی‌دهد.
          </Typography>

          <TextField
            label="رمز عبور برای این فایل پشتیبان (اختیاری)"
            type="password"
            size="small"
            fullWidth
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            helperText={
              exportPassword.trim()
                ? "برای بازیابی این فایل روی هر دستگاهی، همین رمز عبور لازم است — آن را جایی امن یادداشت کنید."
                : "اگر خالی بماند، فایل با کلید مخصوص همین دستگاه رمزنگاری می‌شود (باز هم غیرقابل‌خواندن، فقط قابل بازیابی روی همین گوشی)."
            }
            sx={{ mb: 2 }}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="contained"
              startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <CloudDownloadIcon />}
              onClick={handleExport}
              disabled={isExporting}
              fullWidth
            >
              دانلود فایل پشتیبان
            </Button>
            <Button
              variant="outlined"
              startIcon={isImporting ? <CircularProgress size={18} /> : <CloudUploadIcon />}
              onClick={handleImportClick}
              disabled={isImporting}
              fullWidth
            >
              بازیابی از فایل پشتیبان
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={handleImportFileChange}
            />
          </Stack>

          {pendingImportFile && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
              <Typography variant="body2" fontWeight={700} mb={1}>
                این فایل پشتیبان با رمز عبور محافظت شده است
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
                <TextField
                  label="رمز عبور فایل پشتیبان"
                  type="password"
                  size="small"
                  fullWidth
                  value={importPassword}
                  onChange={(e) => {
                    setImportPassword(e.target.value);
                    if (importPasswordError) setImportPasswordError(null);
                  }}
                  error={!!importPasswordError}
                  helperText={importPasswordError ?? undefined}
                  autoFocus
                />
                <Button
                  variant="contained"
                  onClick={handleSubmitImportPassword}
                  disabled={isImporting || !importPassword.trim()}
                >
                  {isImporting ? <CircularProgress size={18} color="inherit" /> : "بازیابی"}
                </Button>
                <Button
                  color="inherit"
                  onClick={() => {
                    setPendingImportFile(null);
                    setImportPassword("");
                    setImportPasswordError(null);
                  }}
                  disabled={isImporting}
                >
                  انصراف
                </Button>
              </Stack>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          <Alert severity="warning" variant="outlined">
            بازیابی از فایل پشتیبان، تمام اطلاعات فعلی (نیروها، حضور، عکس‌ها و حساب‌ها) را
            پاک و با محتوای فایل جایگزین می‌کند. این عملیات قابل بازگشت نیست.
          </Alert>
        </CardContent>
      </Card>

      <AutoBackupCard />

      <CloudBackupCard />

      <NotificationSettingsCard />

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <InfoOutlinedIcon color="action" />
            <Typography variant="subtitle1" fontWeight={700}>
              {t("settings.aboutSection.title")}
            </Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2">{t("settings.aboutSection.appName")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("settings.aboutSection.versionLabel")}: {__APP_VERSION__}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("settings.aboutSection.description")}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
