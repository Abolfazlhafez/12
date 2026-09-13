import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import DeleteIcon from "@mui/icons-material/Delete";
import BoltIcon from "@mui/icons-material/Bolt";
import FreeBreakfastIcon from "@mui/icons-material/FreeBreakfast";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import SecurityIcon from "@mui/icons-material/Security";
import { workersApi } from "../../shared/api/workersApi";
import { attendanceApi } from "../../shared/api/attendanceApi";
import { settingsApi } from "../../shared/api/settingsApi";
import { optionalLeaveApi } from "../../shared/api/optionalLeaveApi";
import { OptionalLeaveType, OPTIONAL_LEAVE_TYPE_LABELS } from "../../entities/OptionalLeave";
import { timeLossApi } from "../../shared/api/timeLossApi";
import { breakTimeApi } from "../../shared/api/breakTimeApi";
import { guardShiftsApi } from "../../shared/api/guardShiftsApi";
import { extractErrorMessage } from "../../shared/api/client";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorState } from "../../shared/components/ErrorState";
import { EmptyState } from "../../shared/components/EmptyState";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { useToast } from "../../shared/components/ToastProvider";
import { JalaliDatePicker } from "../../shared/components/JalaliDatePicker";
import { AnimatedList } from "../../shared/components/AnimatedList";
import { AttendanceFormDialog } from "../../widgets/attendance-form/AttendanceFormDialog";
import { TimeLossFormDialog } from "../../widgets/timeloss-form/TimeLossFormDialog";
import { TimeLossItem } from "../../widgets/timeloss-form/TimeLossItem";
import { BreakTimeFormDialog } from "../../widgets/timeloss-form/BreakTimeFormDialog";
import { GuardShiftFormDialog } from "../../widgets/guard-duty/GuardShiftFormDialog";
import { OptionalLeaveFormDialog } from "../../widgets/optional-leave/OptionalLeaveFormDialog";
import { PhotoGallery } from "../../widgets/photo-gallery/PhotoGallery";
import { WorkerAvatar } from "../../widgets/worker-form/WorkerAvatar";
import { getTodayIso, toJalaliDisplay, toJalaliWithWeekday } from "../../shared/utils/jalaliDate";
import { formatCurrency, formatMinutesToText } from "../../shared/utils/format";
import { TimeLoss } from "../../entities/TimeLoss";
import { BreakTimeType } from "../../entities/BreakTime";
import { GuardShift } from "../../entities/GuardShift";
import { reportsApi } from "../../shared/api/dashboardApi";

interface AttendancePageProps {
  /** وقتی درون صفحه «منابع» به‌صورت زیرتب نمایش داده می‌شود، عنوان تکراری مخفی می‌گردد. */
  embedded?: boolean;
  /**
   * حضور و غیاب دیگر یک تب مستقل نیست — طبق بازطراحی، از داخل کارت هر نیرو
   * در تب «نیروها» باز می‌شود و مستقیم روی همان یک نفر می‌رود. وقتی این مقدار
   * پر باشد: انتخابگر نیرو، دکمه‌های دسته‌جمعی («ثبت سریع همه») و کادر
   * نام/آواتار تکراری (که در سربرگ دیالوگ بیرونی همین اطلاعات هست) مخفی
   * می‌شوند و صفحه فقط حول همین یک نیرو + تاریخ انتخابی می‌چرخد.
   */
  lockedWorkerId?: string;
}

export function AttendancePage({ embedded = false, lockedWorkerId }: AttendancePageProps = {}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const today = getTodayIso();

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(lockedWorkerId ?? "");

  // اگر دیالوگ قفل‌شده برای نیروی دیگری دوباره باز شود (بدون remount کامل
  // کامپوننت)، انتخاب باید با prop جدید هم‌گام بماند.
  useEffect(() => {
    if (lockedWorkerId) setSelectedWorkerId(lockedWorkerId);
  }, [lockedWorkerId]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [timeLossDialogOpen, setTimeLossDialogOpen] = useState(false);
  const [breakTimeDialogOpen, setBreakTimeDialogOpen] = useState(false);
  // وقتی «صبحانه سریع»/«ناهار سریع» زده می‌شود ولی نه ساعت پیش‌فرضی در
  // تنظیمات موجود است و نه سابقه‌ای برای این نیرو، به‌جای خطا، فرم ثبت
  // دستی با همین نوع از پیش انتخاب‌شده باز می‌شود. این مقدار همان نوع را
  // نگه می‌دارد تا BreakTimeFormDialog با آن باز شود.
  const [breakTimeInitialType, setBreakTimeInitialType] = useState<BreakTimeType>("breakfast");
  const [editingTimeLoss, setEditingTimeLoss] = useState<TimeLoss | null>(null);
  const [deletingTimeLoss, setDeletingTimeLoss] = useState<TimeLoss | null>(null);
  const [deletingBreakTimeId, setDeletingBreakTimeId] = useState<string | null>(null);
  const [guardShiftDialogOpen, setGuardShiftDialogOpen] = useState(false);
  const [editingGuardShift, setEditingGuardShift] = useState<GuardShift | null>(null);
  const [deletingGuardShift, setDeletingGuardShift] = useState<GuardShift | null>(null);
  const [quickCheckInSettingsOpen, setQuickCheckInSettingsOpen] = useState(false);
  const [quickCheckInTimeDraft, setQuickCheckInTimeDraft] = useState("");
  const [quickCheckOutTimeDraft, setQuickCheckOutTimeDraft] = useState("");
  const [deleteAttendanceConfirmOpen, setDeleteAttendanceConfirmOpen] = useState(false);
  const [optionalLeaveDialogOpen, setOptionalLeaveDialogOpen] = useState(false);
  const [deleteOptionalLeaveConfirmOpen, setDeleteOptionalLeaveConfirmOpen] = useState(false);

  const { data: appSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
  });

  const updateQuickCheckInMutation = useMutation({
    mutationFn: (input: { checkIn: string; checkOut: string }) =>
      settingsApi.updateQuickCheckInSettings({
        quickCheckInDefaultTime: input.checkIn,
        quickCheckOutDefaultTime: input.checkOut,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      showToast("ساعت پیش‌فرض ثبت حضور سریع تغییر کرد.", "success");
      setQuickCheckInSettingsOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ["workers", "active"],
    queryFn: () => workersApi.list({ isActive: true }),
  });

  // برای «ثبت سریع همه» لازم است بدانیم کدام نیروها از قبل برای همین تاریخ
  // حضور ثبت‌شده دارند (تا آن‌ها را رد کند و دوباره ننویسد).
  const { data: attendancesForDate } = useQuery({
    queryKey: ["attendances", "by-date", selectedDate],
    queryFn: () => attendanceApi.list({ date: selectedDate }),
  });

  const selectedWorker = useMemo(
    () => workers?.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

  const { data: attendances, isLoading: attendanceLoading } = useQuery({
    queryKey: ["attendances", selectedWorkerId, selectedDate],
    queryFn: () => attendanceApi.list({ workerId: selectedWorkerId, date: selectedDate }),
    enabled: !!selectedWorkerId,
  });

  const currentAttendance = attendances?.[0] || null;

  const { data: currentOptionalLeave } = useQuery({
    queryKey: ["optional-leave", selectedWorkerId, selectedDate],
    queryFn: () => optionalLeaveApi.findByWorkerAndDate(selectedWorkerId, selectedDate),
    enabled: !!selectedWorkerId,
  });

  const {
    data: dailyReport,
    isLoading: reportLoading,
    isError: reportError,
    error: reportErrorObj,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ["daily-report", selectedWorkerId, selectedDate],
    queryFn: () => reportsApi.dailyForWorker(selectedWorkerId, selectedDate),
    enabled: !!selectedWorkerId,
  });

  const { data: timeLosses } = useQuery({
    queryKey: ["time-losses", currentAttendance?.id],
    queryFn: () => timeLossApi.list({ attendanceId: currentAttendance!.id }),
    enabled: !!currentAttendance?.id,
  });

  const { data: breakTimes } = useQuery({
    queryKey: ["break-times", currentAttendance?.id],
    queryFn: () => breakTimeApi.list({ attendanceId: currentAttendance!.id }),
    enabled: !!currentAttendance?.id,
  });

  const { data: guardShifts } = useQuery({
    queryKey: ["guard-shifts", selectedWorkerId, selectedDate],
    queryFn: () => guardShiftsApi.findByWorkerAndDate(selectedWorkerId, selectedDate),
    enabled: !!selectedWorkerId && !!selectedWorker?.guardDutyEnabled,
  });

  // آخرین نوبت نگهبانی ثبت‌شدهٔ همین نیرو قبل از تاریخ فعلی — فقط برای
  // پیشنهاد ساعت شروع/پایان در دیالوگ ثبت نوبت جدید استفاده می‌شود (نوبت‌های
  // نگهبانی معمولاً هر شب ساعت ثابتی دارند، پس تایپ دوباره تکراری است).
  const { data: previousGuardShifts } = useQuery({
    queryKey: ["guard-shifts", "previous", selectedWorkerId, selectedDate],
    queryFn: () => guardShiftsApi.list({ workerId: selectedWorkerId, to: selectedDate }),
    enabled: !!selectedWorkerId && !!selectedWorker?.guardDutyEnabled,
  });
  const previousGuardShift = (previousGuardShifts ?? [])
    .filter((s) => s.date < selectedDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["attendances"] });
    queryClient.invalidateQueries({ queryKey: ["daily-report"] });
    queryClient.invalidateQueries({ queryKey: ["time-losses"] });
    queryClient.invalidateQueries({ queryKey: ["break-times"] });
    queryClient.invalidateQueries({ queryKey: ["guard-shifts"] });
    queryClient.invalidateQueries({ queryKey: ["optional-leave"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }

  const upsertAttendanceMutation = useMutation({
    mutationFn: (input: { checkIn: string | null; checkOut: string | null; note: string | null }) =>
      attendanceApi.upsert({
        workerId: selectedWorkerId,
        date: selectedDate,
        ...input,
      }),
    onSuccess: () => {
      invalidateAll();
      showToast("حضور با موفقیت ثبت شد.", "success");
      setAttendanceDialogOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  // حذف کامل رکورد حضور — این عملیات کاملاً اختیاری و فقط با درخواست صریح
  // کاربر انجام می‌شود (هرگز خودکار)؛ با حذف، وضعیت شخص برای این روز دوباره
  // به «بدون ثبت» برمی‌گردد، دقیقاً طبق نیاز.
  const deleteAttendanceMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      showToast("حضور حذف شد.", "success");
      setDeleteAttendanceConfirmOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  // --- غیبت مجاز: کاملاً مستقل از حضور و غیاب عادی — یک روز کامل که نیرو
  // سر کار نیامده ولی با اجازه/توافق بوده (مرخصی، مأموریت و...). خودِ سرویس
  // (optionalLeaveService) جلوی ثبت هم‌زمان حضور واقعی و غیبت مجاز برای یک
  // نیرو-تاریخ را می‌گیرد، پس این‌جا فقط پیام خطای احتمالی آن نمایش داده می‌شود.
  const optionalLeaveUpsertMutation = useMutation({
    mutationFn: (input: { type: OptionalLeaveType; isPaid: boolean; note: string | null }) =>
      optionalLeaveApi.upsert({ workerId: selectedWorkerId, date: selectedDate, ...input }),
    onSuccess: () => {
      invalidateAll();
      showToast("غیبت مجاز ثبت شد.", "success");
      setOptionalLeaveDialogOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const optionalLeaveDeleteMutation = useMutation({
    mutationFn: (id: string) => optionalLeaveApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      showToast("غیبت مجاز حذف شد.", "success");
      setDeleteOptionalLeaveConfirmOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  // «ثبت سریع»: بدون باز کردن دیالوگ، ساعت پیشنهادی را با یک تپ برای همین
  // تاریخ ثبت می‌کند. اولویت پیشنهاد: ۱) شیفت ثابت خودِ نیرو در پروفایلش،
  // ۲) آخرین حضور واقعی ثبت‌شدهٔ همان نیرو، ۳) ساعت پیش‌فرض سراسری (تنظیمات
  // → حضور و غیاب → ثبت حضور سریع) — این لایهٔ سوم عمداً اضافه شده تا این
  // دکمه حتی برای اولین‌بار (بدون هیچ سابقه‌ای از آن نیرو) هم کار کند؛ فقط
  // اگر ساعت پیش‌فرض سراسری هم به‌گونه‌ای نامعتبر/خالی باشد، خطا می‌دهد.
  const quickCheckInMutation = useMutation({
    mutationFn: async () => {
      const suggestion = await attendanceApi.getSuggestedTimes(selectedWorkerId);
      if (!suggestion.checkIn && !suggestion.checkOut) {
        throw new Error(
          "ساعت پیش‌فرضی موجود نیست. از «تنظیمات → حضور و غیاب → ثبت حضور سریع» یک ساعت پیش‌فرض تنظیم کنید، یا این‌جا یک‌بار «ثبت حضور» را به‌صورت دستی انجام دهید."
        );
      }
      return attendanceApi.upsert({
        workerId: selectedWorkerId,
        date: selectedDate,
        checkIn: suggestion.checkIn,
        checkOut: suggestion.checkOut,
      });
    },
    onSuccess: () => {
      invalidateAll();
      showToast("حضور با ساعت پیش‌فرض ثبت شد.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  // «ثبت سریع همه»: مشابه دکمهٔ تک‌نفره، ولی عمداً محدودتر و محتاط‌تر — فقط
  // کسانی را خودکار ثبت می‌کند که واقعاً شیفت ثابت یا سابقهٔ حضور خودشان
  // موجود است (منبع پیشنهاد را صراحتاً چک می‌کند، نه فقط پر بودن ساعت).
  // ساعت پیش‌فرض سراسری این‌جا عمداً استفاده نمی‌شود، چون حدس‌زدن ساعت ورود
  // دسته‌جمعی برای همهٔ نیروهایی که هیچ مدرکی از آن‌ها نداریم، ریسک بسیار
  // بیشتری از یک تپ آگاهانهٔ تک‌نفره دارد؛ چنین افرادی همچنان به‌عنوان
  // «نیاز به ورود دستی» گزارش می‌شوند.
  const [bulkCheckInConfirmOpen, setBulkCheckInConfirmOpen] = useState(false);
  const bulkCheckInMutation = useMutation({
    mutationFn: async () => {
      const alreadyDoneIds = new Set((attendancesForDate ?? []).map((a) => a.workerId));
      const pendingWorkers = (workers ?? []).filter((w) => !alreadyDoneIds.has(w.id));

      let registered = 0;
      const needsManual: string[] = [];

      for (const worker of pendingWorkers) {
        const suggestion = await attendanceApi.getSuggestedTimes(worker.id);
        // مهم: «ثبت سریع همه» فقط باید کسانی را ثبت کند که واقعاً شیفت ثابت
        // یا سابقهٔ حضور خودشان موجود است — هرگز نباید برای کسی که هیچ
        // مدرکی از او نداریم، فقط بر اساس ساعت پیش‌فرض سراسری حدس بزند (آن
        // ساعت پیش‌فرض فقط برای دکمهٔ «ثبت سریع» تک‌نفره ساخته شده، نه برای
        // ثبت خودکار دسته‌جمعی افرادی که هیچ سابقه‌ای ندارند).
        if (
          suggestion.source !== "default-shift" &&
          suggestion.source !== "last-attendance"
        ) {
          needsManual.push(`${worker.firstName} ${worker.lastName}`);
          continue;
        }
        await attendanceApi.upsert({
          workerId: worker.id,
          date: selectedDate,
          checkIn: suggestion.checkIn,
          checkOut: suggestion.checkOut,
        });
        registered += 1;
      }
      return { registered, needsManual, alreadyDoneCount: alreadyDoneIds.size };
    },
    onSuccess: ({ registered, needsManual, alreadyDoneCount }) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["attendances", "by-date"] });
      setBulkCheckInConfirmOpen(false);
      if (registered === 0 && needsManual.length === 0) {
        showToast(
          alreadyDoneCount > 0 ? "حضور همهٔ نیروها برای این تاریخ از قبل ثبت شده بود." : "نیروی فعالی برای ثبت نبود.",
          "info"
        );
        return;
      }
      const parts: string[] = [];
      if (registered > 0) parts.push(`حضور ${registered} نفر با ساعت پیش‌فرض ثبت شد`);
      if (needsManual.length > 0) {
        parts.push(`${needsManual.length} نفر (${needsManual.join("، ")}) سابقه/شیفت ثابت ندارند و نیاز به ورود دستی دارند`);
      }
      showToast(parts.join(" — ") + ".", needsManual.length > 0 ? "info" : "success");
    },
    onError: (err) => {
      setBulkCheckInConfirmOpen(false);
      showToast(extractErrorMessage(err), "error");
    },
  });

  const createTimeLossMutation = useMutation({
    mutationFn: (input: { startTime: string; endTime: string; reason: string; note: string | null }) =>
      timeLossApi.create({
        workerId: selectedWorkerId,
        attendanceId: currentAttendance!.id,
        ...input,
      }),
    onSuccess: () => {
      invalidateAll();
      showToast("اتلاف وقت ثبت شد.", "success");
      setTimeLossDialogOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const updateTimeLossMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { startTime: string; endTime: string; reason: string; note: string | null };
    }) => timeLossApi.update(id, input),
    onSuccess: () => {
      invalidateAll();
      showToast("اتلاف وقت ویرایش شد.", "success");
      setTimeLossDialogOpen(false);
      setEditingTimeLoss(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deleteTimeLossMutation = useMutation({
    mutationFn: (id: string) => timeLossApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      showToast("اتلاف وقت حذف شد.", "success");
      setDeletingTimeLoss(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const createBreakTimeMutation = useMutation({
    mutationFn: (input: { type: BreakTimeType; startTime: string; endTime: string; note: string | null }) =>
      breakTimeApi.create({
        workerId: selectedWorkerId,
        attendanceId: currentAttendance!.id,
        ...input,
      }),
    onSuccess: () => {
      invalidateAll();
      showToast("استراحت با موفقیت ثبت شد.", "success");
      setBreakTimeDialogOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  // «ثبت سریع» صبحانه/ناهار با این اولویت ساعت را تعیین می‌کند:
  //  ۱) ساعت پیش‌فرض دستی که کاربر در تنظیمات مشخص کرده (اگر باشد).
  //  ۲) وگرنه آخرین استراحتِ همان نوع که خودِ کاربر قبلاً برای همین نیرو
  //     ثبت کرده (سابقه).
  //  ۳) اگر هیچ‌کدام نبود، دیگر خطا نمی‌دهد — به‌جای آن فرم ثبت دستی با
  //     همین نوع از پیش انتخاب‌شده باز می‌شود تا کاربر یک‌بار وارد کند.
  const quickBreakMutation = useMutation({
    mutationFn: async (type: BreakTimeType) => {
      const quick = await breakTimeApi.getQuickBreakTime(selectedWorkerId, type);
      if (!quick.startTime || !quick.endTime) {
        return { needsManualEntry: true as const, type };
      }
      const created = await breakTimeApi.create({
        workerId: selectedWorkerId,
        attendanceId: currentAttendance!.id,
        type,
        startTime: quick.startTime,
        endTime: quick.endTime,
        note: null,
      });
      return { needsManualEntry: false as const, type, created, source: quick.source };
    },
    onSuccess: (result) => {
      if (result.needsManualEntry) {
        setBreakTimeInitialType(result.type);
        setBreakTimeDialogOpen(true);
        showToast("ساعت پیش‌فرض یا سابقه‌ای موجود نیست؛ لطفاً یک‌بار دستی وارد کنید.", "info");
        return;
      }
      invalidateAll();
      const label = result.type === "breakfast" ? "صبحانه" : "ناهار";
      const sourceLabel = result.source === "settings-default" ? "ساعت پیش‌فرض تنظیمات" : "ساعت قبلی";
      showToast(`استراحت ${label} با ${sourceLabel} ثبت شد.`, "success");
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deleteBreakTimeMutation = useMutation({
    mutationFn: (id: string) => breakTimeApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      showToast("استراحت حذف شد.", "success");
      setDeletingBreakTimeId(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const createGuardShiftMutation = useMutation({
    mutationFn: (input: { startTime: string; endTime: string; note: string | null }) =>
      guardShiftsApi.create({
        workerId: selectedWorkerId,
        date: selectedDate,
        ...input,
      }),
    onSuccess: () => {
      invalidateAll();
      showToast("نوبت نگهبانی ثبت شد.", "success");
      setGuardShiftDialogOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const updateGuardShiftMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { startTime: string; endTime: string; note: string | null };
    }) => guardShiftsApi.update(id, input),
    onSuccess: () => {
      invalidateAll();
      showToast("نوبت نگهبانی ویرایش شد.", "success");
      setGuardShiftDialogOpen(false);
      setEditingGuardShift(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deleteGuardShiftMutation = useMutation({
    mutationFn: (id: string) => guardShiftsApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      showToast("نوبت نگهبانی حذف شد.", "success");
      setDeletingGuardShift(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  function handleGuardShiftSubmit(input: { startTime: string; endTime: string; note: string | null }) {
    if (editingGuardShift) {
      updateGuardShiftMutation.mutate({ id: editingGuardShift.id, input });
    } else {
      createGuardShiftMutation.mutate(input);
    }
  }

  function handleTimeLossSubmit(input: {
    startTime: string;
    endTime: string;
    reason: string;
    note: string | null;
  }) {
    if (editingTimeLoss) {
      updateTimeLossMutation.mutate({ id: editingTimeLoss.id, input });
    } else {
      createTimeLossMutation.mutate(input);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {!embedded && (
        <Typography variant="h5" fontWeight={700}>
          ثبت حضور، اتلاف وقت و استراحت
        </Typography>
      )}

      <Stack spacing={1.5}>
        {!lockedWorkerId && (
          <>
            {/*
              قبلاً یک TextField select ساده بود که با تعداد زیاد نیرو اسکرول‌کردن
              در لیست را سخت می‌کرد. الان با Autocomplete جایگزین شده تا بشود با
              تایپ کردن اسم، نیرو را سریع پیدا کرد. علامت ✓ سبز کنار اسم هم نشان
              می‌دهد کدام نیروها برای همین تاریخ از قبل حضور ثبت‌شده دارند — بدون
              نیاز به انتخاب تک‌تک برای چک‌کردن.
            */}
            <Autocomplete
              options={workers ?? []}
              loading={workersLoading}
              value={selectedWorker}
              onChange={(_, value) => setSelectedWorkerId(value?.id ?? "")}
              getOptionLabel={(w) => `${w.firstName} ${w.lastName}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="نیرویی پیدا نشد"
              loadingText="در حال بارگذاری..."
              renderOption={(props, w) => {
                const hasAttendance = (attendancesForDate ?? []).some((a) => a.workerId === w.id);
                return (
                  <MenuItem {...props} key={w.id}>
                    <Stack direction="row" alignItems="center" spacing={1} width="100%">
                      <WorkerAvatar
                        avatarPhotoId={w.avatarPhotoId}
                        initials={`${w.firstName.charAt(0)}${w.lastName.charAt(0)}`}
                        size={24}
                      />
                      <Box flex={1}>
                        {w.firstName} {w.lastName} — {w.position}
                      </Box>
                      {hasAttendance && (
                        <Typography variant="caption" color="success.main" fontWeight={700}>
                          ✓ ثبت‌شده
                        </Typography>
                      )}
                    </Stack>
                  </MenuItem>
                );
              }}
              renderInput={(params) => <TextField {...params} label="انتخاب نیرو" placeholder="جستجوی نام..." />}
            />
          </>
        )}

        <JalaliDatePicker label="تاریخ" value={selectedDate} onChange={setSelectedDate} size="small" />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
          {toJalaliWithWeekday(selectedDate)}
        </Typography>

        {!lockedWorkerId && (
          <>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<BoltIcon />}
              onClick={() => setBulkCheckInConfirmOpen(true)}
            >
              ثبت سریع حضور همهٔ نیروها برای این تاریخ
            </Button>
            <Tooltip
              title={`تغییر ساعت پیش‌فرض ثبت سریع (فعلی: ${appSettings?.quickCheckInDefaultTime ?? "..."} تا ${
                appSettings?.quickCheckOutDefaultTime ?? "..."
              })`}
            >
              <IconButton
                size="small"
                onClick={() => {
                  setQuickCheckInTimeDraft(appSettings?.quickCheckInDefaultTime ?? "08:00");
                  setQuickCheckOutTimeDraft(appSettings?.quickCheckOutDefaultTime ?? "17:00");
                  setQuickCheckInSettingsOpen(true);
                }}
                aria-label="تنظیم ساعت پیش‌فرض ثبت سریع"
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      <ConfirmDialog
        open={bulkCheckInConfirmOpen}
        title="ثبت سریع حضور همه"
        description="برای همهٔ نیروهای فعالی که هنوز برای این تاریخ حضوری ثبت نکرده‌اند، ساعت ورود/خروج از روی شیفت ثابت یا آخرین حضور خودشان ثبت می‌شود. نیرویی که سابقه یا شیفت ثابتی نداشته باشد، ثبت نمی‌شود و باید دستی وارد شود."
        confirmLabel="ثبت برای همه"
        confirmColor="primary"
        loading={bulkCheckInMutation.isPending}
        onCancel={() => setBulkCheckInConfirmOpen(false)}
        onConfirm={() => bulkCheckInMutation.mutate()}
      />

      <Dialog open={quickCheckInSettingsOpen} onClose={() => setQuickCheckInSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>ساعت پیش‌فرض ثبت حضور سریع</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            این ساعت‌ها فقط برای نیروهایی استفاده می‌شوند که سابقهٔ حضور قبلی یا شیفت ثابت اختصاصی ندارند
            (یا سابقهٔ آن‌ها فقط یک طرف ورود/خروج را دارد).
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="ساعت ورود پیش‌فرض"
              type="time"
              value={quickCheckInTimeDraft}
              onChange={(e) => setQuickCheckInTimeDraft(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="ساعت خروج پیش‌فرض"
              type="time"
              value={quickCheckOutTimeDraft}
              onChange={(e) => setQuickCheckOutTimeDraft(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setQuickCheckInSettingsOpen(false)} color="inherit" disabled={updateQuickCheckInMutation.isPending}>
            انصراف
          </Button>
          <Button
            onClick={() =>
              quickCheckInTimeDraft &&
              quickCheckOutTimeDraft &&
              updateQuickCheckInMutation.mutate({ checkIn: quickCheckInTimeDraft, checkOut: quickCheckOutTimeDraft })
            }
            variant="contained"
            disabled={updateQuickCheckInMutation.isPending || !quickCheckInTimeDraft || !quickCheckOutTimeDraft}
          >
            ذخیره
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteAttendanceConfirmOpen}
        title="حذف حضور"
        description={
          currentAttendance
            ? `آیا از حذف حضور ثبت‌شده (ورود: ${currentAttendance.checkIn || "—"}، خروج: ${currentAttendance.checkOut || "—"}) مطمئن هستید؟ وضعیت این نیرو برای این تاریخ دوباره به «بدون ثبت» برمی‌گردد.`
            : ""
        }
        confirmLabel="حذف"
        loading={deleteAttendanceMutation.isPending}
        onCancel={() => setDeleteAttendanceConfirmOpen(false)}
        onConfirm={() => currentAttendance && deleteAttendanceMutation.mutate(currentAttendance.id)}
      />

      <OptionalLeaveFormDialog
        open={optionalLeaveDialogOpen}
        workerName={selectedWorker ? `${selectedWorker.firstName} ${selectedWorker.lastName}` : undefined}
        dateLabel={toJalaliDisplay(selectedDate)}
        existing={currentOptionalLeave}
        loading={optionalLeaveUpsertMutation.isPending}
        onClose={() => setOptionalLeaveDialogOpen(false)}
        onSubmit={(input) => optionalLeaveUpsertMutation.mutate(input)}
      />

      <ConfirmDialog
        open={deleteOptionalLeaveConfirmOpen}
        title="حذف غیبت مجاز"
        description={
          currentOptionalLeave
            ? `آیا از حذف «${OPTIONAL_LEAVE_TYPE_LABELS[currentOptionalLeave.type]}» ثبت‌شده برای این تاریخ مطمئن هستید؟`
            : ""
        }
        confirmLabel="حذف"
        loading={optionalLeaveDeleteMutation.isPending}
        onCancel={() => setDeleteOptionalLeaveConfirmOpen(false)}
        onConfirm={() => currentOptionalLeave && optionalLeaveDeleteMutation.mutate(currentOptionalLeave.id)}
      />

      {selectedWorker && !lockedWorkerId && (
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <WorkerAvatar
            avatarPhotoId={selectedWorker.avatarPhotoId}
            initials={`${selectedWorker.firstName.charAt(0)}${selectedWorker.lastName.charAt(0)}`}
            size={40}
          />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              {selectedWorker.firstName} {selectedWorker.lastName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedWorker.position}
            </Typography>
          </Box>
        </Stack>
      )}

      {!selectedWorkerId && !lockedWorkerId && (
        <EmptyState
          icon={<EventBusyIcon fontSize="inherit" />}
          title="یک نیرو انتخاب کنید"
          description="برای ثبت حضور، ابتدا نیرو و تاریخ مورد نظر را انتخاب کنید."
        />
      )}

      {selectedWorkerId && (attendanceLoading || reportLoading) && <LoadingState />}
      {selectedWorkerId && reportError && (
        <ErrorState message={extractErrorMessage(reportErrorObj)} onRetry={() => refetchReport()} />
      )}

      {selectedWorkerId && dailyReport && !reportLoading && (
        <>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="subtitle1" fontWeight={700}>
                  وضعیت حضور
                </Typography>
                <Stack direction="row" spacing={1}>
                  {!currentAttendance && !currentOptionalLeave && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<BoltIcon />}
                      disabled={quickCheckInMutation.isPending}
                      onClick={() => quickCheckInMutation.mutate()}
                    >
                      ثبت سریع
                    </Button>
                  )}
                  {!currentOptionalLeave && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<LoginIcon />}
                      onClick={() => setAttendanceDialogOpen(true)}
                    >
                      {currentAttendance ? "ویرایش حضور" : "ثبت حضور"}
                    </Button>
                  )}
                  {currentAttendance && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteAttendanceConfirmOpen(true)}
                      aria-label="حذف حضور"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                  {!currentAttendance && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      startIcon={<EventBusyIcon />}
                      onClick={() => setOptionalLeaveDialogOpen(true)}
                    >
                      {currentOptionalLeave ? "ویرایش غیبت مجاز" : "ثبت غیبت مجاز"}
                    </Button>
                  )}
                  {currentOptionalLeave && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteOptionalLeaveConfirmOpen(true)}
                      aria-label="حذف غیبت مجاز"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              </Stack>

              {currentOptionalLeave && (
                <Chip
                  label={`${OPTIONAL_LEAVE_TYPE_LABELS[currentOptionalLeave.type]}${currentOptionalLeave.isPaid ? " (با حقوق)" : " (بدون حقوق)"}`}
                  color="warning"
                  size="small"
                  sx={{ mb: 1.5 }}
                />
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
                <Chip
                  label={`ورود: ${dailyReport.checkIn || "ثبت نشده"}`}
                  color={dailyReport.checkIn ? "success" : "default"}
                  size="small"
                />
                <Chip
                  label={`خروج: ${dailyReport.checkOut || "ثبت نشده"}`}
                  color={dailyReport.checkOut ? "success" : "default"}
                  size="small"
                />
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    کل زمان حضور
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatMinutesToText(dailyReport.totalAttendanceMinutes)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    کل اتلاف وقت
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="warning.main">
                    {formatMinutesToText(dailyReport.totalTimeLossMinutes)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    استراحت مجاز (صبحانه/ناهار)
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="info.main">
                    {formatMinutesToText(dailyReport.totalBreakMinutes)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    زمان مفید
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    {formatMinutesToText(dailyReport.usefulMinutes)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    حقوق قابل پرداخت (کار عادی)
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                    {formatCurrency(dailyReport.payableSalary)}
                  </Typography>
                </Stack>
                {dailyReport.guardDuty.enabled && dailyReport.guardDuty.shiftsCount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      دستمزد نگهبانی ({dailyReport.guardDuty.shiftsCount} نوبت)
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#7B4FA0" }}>
                      {formatCurrency(dailyReport.guardDuty.payableSalary)}
                    </Typography>
                  </Stack>
                )}
              </Stack>
              <Typography variant="caption" color="text.disabled" display="block" mt={1}>
                * زمان استراحت مجاز حق قانونی نیروست و از حقوق کسر نمی‌شود.
              </Typography>
            </CardContent>
          </Card>

          {selectedWorker?.guardDutyEnabled && (
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <SecurityIcon fontSize="small" sx={{ color: "#7B4FA0" }} />
                    <Typography variant="subtitle1" fontWeight={700}>
                      نوبت‌های نگهبانی
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setEditingGuardShift(null);
                      setGuardShiftDialogOpen(true);
                    }}
                    sx={{ color: "#7B4FA0" }}
                  >
                    افزودن نوبت
                  </Button>
                </Stack>

                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  نگهبانی مستقل از ساعات کاری عادی است و می‌تواند چند نوبت در یک روز داشته باشد.
                </Typography>

                {(!guardShifts || guardShifts.length === 0) && (
                  <Typography variant="caption" color="text.secondary">
                    نوبت نگهبانی‌ای برای این روز ثبت نشده است.
                  </Typography>
                )}

                {guardShifts && guardShifts.length > 0 && (
                  <AnimatedList spacing={0}>
                    {guardShifts.map((shift) => (
                      <Stack
                        key={shift.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        py={0.75}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {shift.startTime} تا {shift.endTime}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatMinutesToText(shift.durationMinutes)}
                            {shift.note ? ` — ${shift.note}` : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            onClick={() => {
                              setEditingGuardShift(shift);
                              setGuardShiftDialogOpen(true);
                            }}
                          >
                            ویرایش
                          </Button>
                          <Button size="small" color="error" onClick={() => setDeletingGuardShift(shift)}>
                            حذف
                          </Button>
                        </Stack>
                      </Stack>
                    ))}
                  </AnimatedList>
                )}

                {dailyReport.guardDuty.shiftsCount > 0 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        جمع دستمزد نگهبانی
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#7B4FA0" }}>
                        {formatCurrency(dailyReport.guardDuty.payableSalary)}
                      </Typography>
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <FreeBreakfastIcon fontSize="small" color="info" />
                  <Typography variant="subtitle1" fontWeight={700}>
                    استراحت مجاز (صبحانه/ناهار)
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75}>
                  {currentAttendance && !breakTimes?.some((bt) => bt.type === "breakfast") && (
                    <Button
                      size="small"
                      color="info"
                      variant="outlined"
                      startIcon={<BoltIcon />}
                      disabled={quickBreakMutation.isPending}
                      onClick={() => quickBreakMutation.mutate("breakfast")}
                    >
                      صبحانه سریع
                    </Button>
                  )}
                  {currentAttendance && !breakTimes?.some((bt) => bt.type === "lunch") && (
                    <Button
                      size="small"
                      color="info"
                      variant="outlined"
                      startIcon={<BoltIcon />}
                      disabled={quickBreakMutation.isPending}
                      onClick={() => quickBreakMutation.mutate("lunch")}
                    >
                      ناهار سریع
                    </Button>
                  )}
                  <Button
                    size="small"
                    color="info"
                    startIcon={<AddIcon />}
                    disabled={!currentAttendance}
                    onClick={() => {
                      setBreakTimeInitialType("breakfast");
                      setBreakTimeDialogOpen(true);
                    }}
                  >
                    ثبت
                  </Button>
                </Stack>
              </Stack>

              {!currentAttendance && (
                <Typography variant="caption" color="text.secondary">
                  ابتدا ساعت ورود را برای این روز ثبت کنید.
                </Typography>
              )}
              {currentAttendance && (!breakTimes || breakTimes.length === 0) && (
                <Typography variant="caption" color="text.secondary">
                  استراحتی برای این روز ثبت نشده است.
                </Typography>
              )}
              {breakTimes && breakTimes.length > 0 && (
                <AnimatedList spacing={0}>
                  {breakTimes.map((bt) => (
                    <Stack
                      key={bt.id}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      py={0.75}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {bt.type === "breakfast" ? "صبحانه" : bt.type === "lunch" ? "ناهار" : "سایر"} —{" "}
                          {bt.startTime} تا {bt.endTime}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatMinutesToText(bt.durationMinutes)}
                        </Typography>
                      </Box>
                      <Button size="small" color="error" onClick={() => setDeletingBreakTimeId(bt.id)}>
                        حذف
                      </Button>
                    </Stack>
                  ))}
                </AnimatedList>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle1" fontWeight={700}>
                  اتلاف وقت‌ها
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  disabled={!currentAttendance}
                  onClick={() => {
                    setEditingTimeLoss(null);
                    setTimeLossDialogOpen(true);
                  }}
                >
                  افزودن
                </Button>
              </Stack>

              {!currentAttendance && (
                <Typography variant="caption" color="text.secondary">
                  ابتدا ساعت ورود را برای این روز ثبت کنید.
                </Typography>
              )}

              {currentAttendance && (!timeLosses || timeLosses.length === 0) && (
                <Typography variant="caption" color="text.secondary">
                  اتلاف وقتی برای این روز ثبت نشده است.
                </Typography>
              )}

              {timeLosses && timeLosses.length > 0 && (
                <AnimatedList spacing={0}>
                  {timeLosses.map((tl) => (
                    <TimeLossItem
                      key={tl.id}
                      timeLoss={tl}
                      onEdit={(t) => {
                        setEditingTimeLoss(t);
                        setTimeLossDialogOpen(true);
                      }}
                      onDelete={setDeletingTimeLoss}
                    />
                  ))}
                </AnimatedList>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={0.75} mb={1}>
                <PhotoLibraryIcon fontSize="small" color="primary" />
                <Typography variant="subtitle1" fontWeight={700}>
                  گالری عکس این روز
                </Typography>
              </Stack>
              {currentAttendance ? (
                <PhotoGallery
                  relatedType="attendance"
                  relatedId={currentAttendance.id}
                  compact
                  emptyTitle="عکسی برای این روز ثبت نشده است."
                  emptyDescription="مثلاً عکس پیشرفت کار یا محل کار امروز را اضافه کنید."
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  ابتدا ساعت ورود را برای این روز ثبت کنید.
                </Typography>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AttendanceFormDialog
        open={attendanceDialogOpen}
        worker={selectedWorker}
        date={selectedDate}
        existingAttendance={currentAttendance}
        loading={upsertAttendanceMutation.isPending}
        onClose={() => setAttendanceDialogOpen(false)}
        onSubmit={(input) => upsertAttendanceMutation.mutate(input)}
      />

      <TimeLossFormDialog
        open={timeLossDialogOpen}
        workerName={selectedWorker ? `${selectedWorker.firstName} ${selectedWorker.lastName}` : undefined}
        editingTimeLoss={editingTimeLoss}
        loading={createTimeLossMutation.isPending || updateTimeLossMutation.isPending}
        onClose={() => {
          setTimeLossDialogOpen(false);
          setEditingTimeLoss(null);
        }}
        onSubmit={handleTimeLossSubmit}
      />

      <BreakTimeFormDialog
        open={breakTimeDialogOpen}
        workerId={selectedWorkerId}
        workerName={selectedWorker ? `${selectedWorker.firstName} ${selectedWorker.lastName}` : undefined}
        loading={createBreakTimeMutation.isPending}
        initialType={breakTimeInitialType}
        onClose={() => setBreakTimeDialogOpen(false)}
        onSubmit={(input) => createBreakTimeMutation.mutate(input)}
      />

      <GuardShiftFormDialog
        open={guardShiftDialogOpen}
        workerName={selectedWorker ? `${selectedWorker.firstName} ${selectedWorker.lastName}` : undefined}
        editingShift={editingGuardShift}
        previousShift={
          previousGuardShift ? { startTime: previousGuardShift.startTime, endTime: previousGuardShift.endTime } : undefined
        }
        loading={createGuardShiftMutation.isPending || updateGuardShiftMutation.isPending}
        onClose={() => {
          setGuardShiftDialogOpen(false);
          setEditingGuardShift(null);
        }}
        onSubmit={handleGuardShiftSubmit}
      />

      <ConfirmDialog
        open={!!deletingGuardShift}
        title="حذف نوبت نگهبانی"
        description={
          deletingGuardShift
            ? `آیا از حذف نوبت نگهبانی ${deletingGuardShift.startTime} تا ${deletingGuardShift.endTime} مطمئن هستید؟`
            : ""
        }
        confirmLabel="حذف"
        loading={deleteGuardShiftMutation.isPending}
        onConfirm={() => deletingGuardShift && deleteGuardShiftMutation.mutate(deletingGuardShift.id)}
        onCancel={() => setDeletingGuardShift(null)}
      />

      <ConfirmDialog
        open={!!deletingTimeLoss}
        title="حذف اتلاف وقت"
        description={
          deletingTimeLoss ? `آیا از حذف اتلاف وقت «${deletingTimeLoss.reason}» مطمئن هستید؟` : ""
        }
        confirmLabel="حذف"
        loading={deleteTimeLossMutation.isPending}
        onConfirm={() => deletingTimeLoss && deleteTimeLossMutation.mutate(deletingTimeLoss.id)}
        onCancel={() => setDeletingTimeLoss(null)}
      />

      <ConfirmDialog
        open={!!deletingBreakTimeId}
        title="حذف استراحت"
        description="آیا از حذف این رکورد استراحت مطمئن هستید؟"
        confirmLabel="حذف"
        loading={deleteBreakTimeMutation.isPending}
        onConfirm={() => deletingBreakTimeId && deleteBreakTimeMutation.mutate(deletingBreakTimeId)}
        onCancel={() => setDeletingBreakTimeId(null)}
      />
    </Box>
  );
}
