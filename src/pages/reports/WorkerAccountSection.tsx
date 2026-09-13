import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PaidIcon from "@mui/icons-material/Paid";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { workersApi } from "../../shared/api/workersApi";
import { ledgerApi } from "../../shared/api/ledgerApi";
import { cashbookApi } from "../../shared/api/cashbookApi";
import { extractErrorMessage } from "../../shared/api/client";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorState } from "../../shared/components/ErrorState";
import { EmptyState } from "../../shared/components/EmptyState";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { useToast } from "../../shared/components/ToastProvider";
import { ExportMenuButton } from "../../shared/components/ExportMenuButton";
import { LedgerEntryFormDialog, ManualLedgerType } from "../../widgets/ledger-form/LedgerEntryFormDialog";
import { formatCurrency } from "../../shared/utils/format";
import { useLanguage } from "../../shared/hooks/useLanguage";
import { getCurrencyInfo } from "../../shared/i18n/languages";
import { getTodayIso, toJalaliShort, toJalaliWithWeekday } from "../../shared/utils/jalaliDate";
import { exportElementAsShareableImage, saveElementAsImageToDevice } from "../../shared/utils/exportCard";
import { exportRowsAsCsv, saveRowsAsCsvToDevice } from "../../shared/utils/exportCsv";
import { LEDGER_ENTRY_TYPE_LABELS } from "../../entities/Ledger";
import { WorkerAvatar } from "../../widgets/worker-form/WorkerAvatar";

interface WorkerAccountSectionProps {
  /** وقتی از یک نیروی مشخص (مثلاً از دیالوگ پروفایل نیرو) فراخوانی می‌شود، این
   * نیرو از قبل انتخاب‌شده در نظر گرفته می‌شود و انتخاب‌گر «نیرو را انتخاب
   * کنید» اصلاً نمایش داده نمی‌شود — چون کاربر از قبل یک نیروی مشخص را باز
   * کرده و نیازی به انتخاب دوباره از یک فهرست همهٔ نیروها نیست. */
  fixedWorkerId?: string;
  /** فقط وقتی fixedWorkerId داده شده کاربرد دارد: اگر کاربر همان نیروی ثابت
   * را (بعد از حذف همهٔ سابقه‌اش) واقعاً حذف کند، این کال‌بک صدا زده می‌شود
   * تا مثلاً دیالوگ بیرونی (پروفایل نیرو) بسته شود — چون دیگر نیرویی برای
   * نمایش نیست. */
  onFixedWorkerDeleted?: () => void;
}

export function WorkerAccountSection({ fixedWorkerId, onFixedWorkerDeleted }: WorkerAccountSectionProps = {}) {
  const { currency } = useLanguage();
  const currencySymbol = getCurrencyInfo(currency).symbol;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const today = getTodayIso();

  const [selectedWorkerId, setSelectedWorkerId] = useState(fixedWorkerId ?? "");

  // اگر این کامپوننت داخل یک دیالوگ نگه‌داشته‌شده (mount ثابت) برای نیروی
  // دیگری دوباره باز شود، selectedWorkerId باید با fixedWorkerId جدید هماهنگ شود.
  useEffect(() => {
    if (fixedWorkerId) setSelectedWorkerId(fixedWorkerId);
  }, [fixedWorkerId]);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [settleConfirmOpen, setSettleConfirmOpen] = useState(false);
  const [recordInCashbook, setRecordInCashbook] = useState(true);
  // پس از حذف یک تراکنش، اگر نیرو دیگر هیچ سابقه‌ای نداشته باشد، این
  // state پر می‌شود تا دیالوگ سوال «آیا خودِ نیرو هم حذف شود؟» نمایش
  // داده شود. این هیچ‌وقت خودکار انجام نمی‌شود — کاملاً اختیاری و به
  // انتخاب کاربر است.
  const [offerDeleteWorker, setOfferDeleteWorker] = useState<{ workerId: string; workerName: string } | null>(null);
  const printableRef = useRef<HTMLDivElement>(null);

  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: () => workersApi.list(),
  });

  const {
    data: balance,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["worker-balance", selectedWorkerId, today],
    queryFn: () => ledgerApi.getBalance(selectedWorkerId, today),
    enabled: !!selectedWorkerId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["worker-balance"] });
  }

  function invalidateCashbook() {
    queryClient.invalidateQueries({ queryKey: ["cashbook"] });
    queryClient.invalidateQueries({ queryKey: ["cashbook-summary"] });
  }

  const createMutation = useMutation({
    mutationFn: async (input: {
      type: ManualLedgerType;
      amount: number;
      date: string;
      description: string | null;
      recordInCashbook: boolean;
    }) => {
      const { recordInCashbook: shouldRecord, ...ledgerInput } = input;
      const entry = await ledgerApi.create({ workerId: selectedWorkerId, ...ledgerInput });

      if (shouldRecord) {
        // «مساعده» یک پرداخت حقوق است؛ «کسر دستی» یک هزینه (خرج) است — مثلاً
        // بیمه یا جریمه‌ای که کارگاه از حقوق نیرو کم و خودش پرداخت می‌کند.
        const isDeduction = input.type === "deduction";
        await cashbookApi.create({
          type: isDeduction ? "expense" : "salary",
          title: isDeduction
            ? `کسر دستی — ${balance?.workerFullName ?? ""}`
            : `مساعده — ${balance?.workerFullName ?? ""}`,
          amount: input.amount,
          date: input.date,
          description: input.description || "ثبت خودکار از حساب نیرو",
          workerId: selectedWorkerId,
        });
      }
      return entry;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      if (variables.recordInCashbook) invalidateCashbook();
      showToast(
        variables.recordInCashbook
          ? variables.type === "deduction"
            ? "تراکنش ثبت شد و به‌عنوان خرج در دفتر حساب هم ثبت شد."
            : "تراکنش ثبت شد و در دفتر حساب هم کم شد."
          : "تراکنش با موفقیت ثبت شد.",
        "success"
      );
      setFormOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ledgerApi.remove(id),
    onSuccess: (result) => {
      invalidate();
      showToast("تراکنش حذف شد.", "success");
      setDeletingEntryId(null);
      // اگر با حذف این تراکنش، نیرو دیگر هیچ سابقه‌ای نداشت، به‌صورت
      // اختیاری از کاربر می‌پرسیم که آیا خودِ نیرو هم حذف شود. خودِ نیرو
      // هرگز به‌طور خودکار حذف نمی‌شود.
      if (result.workerHasNoRemainingHistory && balance) {
        setOfferDeleteWorker({ workerId: result.workerId, workerName: balance.workerFullName });
      }
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: (id: string) => workersApi.remove(id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      showToast("نیرو حذف شد.", "success");
      setOfferDeleteWorker(null);
      setSelectedWorkerId("");
      if (fixedWorkerId) onFixedWorkerDeleted?.();
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      const settledBalance = balance?.balance ?? 0;
      const workerName = balance?.workerFullName ?? "";
      const entry = await ledgerApi.settle(selectedWorkerId, today);

      if (recordInCashbook && settledBalance !== 0) {
        await cashbookApi.create({
          type: settledBalance > 0 ? "salary" : "deposit",
          title: settledBalance > 0 ? `تسویه حساب — پرداخت به ${workerName}` : `تسویه حساب — دریافت از ${workerName}`,
          amount: Math.abs(settledBalance),
          date: today,
          description: "ثبت خودکار از تسویه حساب نیرو",
          workerId: selectedWorkerId,
        });
      }
      return entry;
    },
    onSuccess: () => {
      invalidate();
      if (recordInCashbook) invalidateCashbook();
      showToast(
        recordInCashbook
          ? "حساب تسویه شد و در دفتر حساب هم ثبت گردید."
          : "حساب با موفقیت تسویه و صفر شد.",
        "success"
      );
      setSettleConfirmOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const balanceColor =
    balance && balance.balance > 0 ? "success.main" : balance && balance.balance < 0 ? "error.main" : "text.primary";
  const balanceLabel =
    balance && balance.balance > 0
      ? "کارگاه به این نیرو بدهکار است (طلب دارد)"
      : balance && balance.balance < 0
      ? "این نیرو به کارگاه بدهکار است"
      : "حساب تسویه است";

  // «خروجی عکس» از همان کارت مانده حساب + لیست تراکنش‌های دیده‌شده روی صفحه
  // عکس می‌گیرد — مثلاً برای فرستادن سریع وضعیت حساب یک نیرو در پیام‌رسان.
  async function handleExportImage() {
    if (!printableRef.current || !balance) return;
    try {
      await exportElementAsShareableImage(
        printableRef.current,
        `حساب-${balance.workerFullName}-${toJalaliShort(today)}.png`,
        "حساب نیرو"
      );
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    }
  }

  // «خروجی اکسل» یک CSV از تراکنش‌های دستی این نیرو در همین بازه می‌سازد.
  async function handleExportExcel() {
    if (!balance) return;
    try {
      const headers = ["نوع", "تاریخ", `مبلغ (${currencySymbol})`, "توضیحات"];
      const rows = balance.entries.map((e) => [
        LEDGER_ENTRY_TYPE_LABELS[e.type],
        toJalaliWithWeekday(e.date),
        e.amount,
        e.description ?? "",
      ]);
      await exportRowsAsCsv(headers, rows, `حساب-${balance.workerFullName}-${toJalaliShort(today)}.csv`);
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    }
  }

  // نسخهٔ «ذخیره در گوشی» همین دو خروجی — بدون بازکردن منوی اشتراک‌گذاری،
  // مستقیماً در پوشهٔ اسناد قابل‌دسترس گوشی نوشته می‌شود.
  async function handleSaveImageToDevice() {
    if (!printableRef.current || !balance) return;
    try {
      await saveElementAsImageToDevice(printableRef.current, `حساب-${balance.workerFullName}-${toJalaliShort(today)}.png`);
      showToast("عکس در حافظهٔ گوشی ذخیره شد.", "success");
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    }
  }

  async function handleSaveExcelToDevice() {
    if (!balance) return;
    try {
      const headers = ["نوع", "تاریخ", `مبلغ (${currencySymbol})`, "توضیحات"];
      const rows = balance.entries.map((e) => [
        LEDGER_ENTRY_TYPE_LABELS[e.type],
        toJalaliWithWeekday(e.date),
        e.amount,
        e.description ?? "",
      ]);
      await saveRowsAsCsvToDevice(headers, rows, `حساب-${balance.workerFullName}-${toJalaliShort(today)}.csv`);
      showToast("فایل اکسل در حافظهٔ گوشی ذخیره شد.", "success");
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {!fixedWorkerId && (
        <TextField
          select
          label="انتخاب نیرو"
          value={selectedWorkerId}
          onChange={(e) => setSelectedWorkerId(e.target.value)}
          disabled={workersLoading}
          size="small"
        >
          <MenuItem value="" disabled>
            {workersLoading ? "در حال بارگذاری..." : "یک نیرو را انتخاب کنید"}
          </MenuItem>
          {workers?.map((w) => (
            <MenuItem key={w.id} value={w.id}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <WorkerAvatar
                  avatarPhotoId={w.avatarPhotoId}
                  initials={`${w.firstName.charAt(0)}${w.lastName.charAt(0)}`}
                  size={24}
                />
                <span>
                  {w.firstName} {w.lastName}
                </span>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
      )}

      {!fixedWorkerId && !selectedWorkerId && (
        <EmptyState
          icon={<AccountBalanceWalletIcon fontSize="inherit" />}
          title="یک نیرو انتخاب کنید"
          description="برای مشاهده و مدیریت حساب طلب و بدهی، ابتدا نیرو را انتخاب کنید."
        />
      )}

      {selectedWorkerId && isLoading && <LoadingState />}
      {selectedWorkerId && isError && (
        <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />
      )}

      {balance && (
        <>
          <Stack direction="row" justifyContent="flex-end">
            <ExportMenuButton
              onExportImage={handleExportImage}
              onExportExcel={handleExportExcel}
              onSaveImageToDevice={handleSaveImageToDevice}
              onSaveExcelToDevice={handleSaveExcelToDevice}
            />
          </Stack>

          <Box ref={printableRef} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  مانده حساب {balance.workerFullName}
                </Typography>
                <Typography variant="h4" fontWeight={800} color={balanceColor} mt={0.5}>
                  {formatCurrency(Math.abs(balance.balance))}
                </Typography>
                <Chip
                  label={balanceLabel}
                  size="small"
                  color={balance.balance > 0 ? "success" : balance.balance < 0 ? "error" : "default"}
                  sx={{ mt: 1 }}
                />

                <Divider sx={{ my: 1.5 }} />

                <Stack spacing={0.75}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      حقوق کارکرد (از {toJalaliShort(balance.sinceDate)})
                    </Typography>
                    <Typography variant="body2" fontWeight={600} color="success.main">
                      +{formatCurrency(balance.totalEarned)}
                    </Typography>
                  </Stack>
                  {balance.totalGuardDutyEarned > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        دستمزد نگهبانی {balance.guardDutyMerged ? "" : "(جدا از مانده حساب)"}
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: balance.guardDutyMerged ? "success.main" : "#7B4FA0" }}
                      >
                        {balance.guardDutyMerged ? "+" : ""}
                        {formatCurrency(balance.totalGuardDutyEarned)}
                      </Typography>
                    </Stack>
                  )}
                  {balance.totalCredits > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        طلب اضافه
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="success.main">
                        +{formatCurrency(balance.totalCredits)}
                      </Typography>
                    </Stack>
                  )}
                  {balance.totalAdvances > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        مساعده دریافتی
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="error.main">
                        -{formatCurrency(balance.totalAdvances)}
                      </Typography>
                    </Stack>
                  )}
                  {balance.totalDeductions > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        کسورات
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="error.main">
                        -{formatCurrency(balance.totalDeductions)}
                      </Typography>
                    </Stack>
                  )}
                </Stack>

                {balance.lastSettlementDate && (
                  <Typography variant="caption" color="text.disabled" display="block" mt={1.5}>
                    آخرین تسویه: {toJalaliShort(balance.lastSettlementDate)}
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={1}>
                  تراکنش‌های این بازه
                </Typography>
                {balance.entries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    تراکنش دستی‌ای در این بازه ثبت نشده است.
                  </Typography>
                ) : (
                  <List disablePadding>
                    {balance.entries.map((entry) => (
                      <ListItem
                        key={entry.id}
                        disableGutters
                        secondaryAction={
                          <IconButton size="small" color="error" onClick={() => setDeletingEntryId(entry.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={`${LEDGER_ENTRY_TYPE_LABELS[entry.type]} — ${formatCurrency(entry.amount)}`}
                          secondary={`${toJalaliWithWeekday(entry.date)}${entry.description ? " — " + entry.description : ""}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Box>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setFormOpen(true)} fullWidth>
              ثبت تراکنش
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<PaidIcon />}
              onClick={() => {
                setRecordInCashbook(true);
                setSettleConfirmOpen(true);
              }}
              disabled={balance.balance === 0}
              fullWidth
            >
              تسویه حساب
            </Button>
          </Stack>

          {balance.balance !== 0 && (
            <Alert severity="info" variant="outlined">
              با زدن «تسویه حساب» یعنی این مبلغ پرداخت/دریافت شد و حساب از امروز به بعد از صفر شروع می‌شود.
            </Alert>
          )}
        </>
      )}

      <LedgerEntryFormDialog
        open={formOpen}
        workerName={balance?.workerFullName}
        loading={createMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <Dialog
        open={settleConfirmOpen}
        onClose={() => !settleMutation.isPending && setSettleConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight={700}>تسویه حساب</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {balance
                ? `مانده فعلی ${formatCurrency(Math.abs(balance.balance))} ${
                    balance.balance > 0 ? "به نیرو پرداخت می‌شود" : "از نیرو دریافت می‌شود"
                  } و حساب از امروز صفر می‌گردد. این عملیات قابل بازگشت نیست.`
                : ""}
            </Typography>

            {balance && balance.balance !== 0 && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={recordInCashbook}
                    onChange={(e) => setRecordInCashbook(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    {balance.balance > 0
                      ? "این مبلغ همزمان به‌عنوان «حقوق پرداختی» از دفتر حساب هم کم شود"
                      : "این مبلغ همزمان به‌عنوان «واریزی» به دفتر حساب اضافه شود"}
                  </Typography>
                }
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setSettleConfirmOpen(false)} color="inherit" disabled={settleMutation.isPending}>
            انصراف
          </Button>
          <Button
            onClick={() => settleMutation.mutate()}
            variant="contained"
            disabled={settleMutation.isPending}
          >
            تایید و تسویه
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deletingEntryId}
        title="حذف تراکنش"
        description="آیا از حذف این تراکنش مطمئن هستید؟"
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
        onConfirm={() => deletingEntryId && deleteMutation.mutate(deletingEntryId)}
        onCancel={() => setDeletingEntryId(null)}
      />

      {/* پس از حذف تراکنش، اگر نیرو دیگر هیچ سابقه‌ای نداشت، اختیاری
          می‌پرسیم آیا خودِ نیرو هم حذف شود — پیش‌فرض «نه»، کاملاً به
          انتخاب کاربر. */}
      <ConfirmDialog
        open={!!offerDeleteWorker}
        title="حذف نیرو؟"
        description={
          offerDeleteWorker
            ? `با حذف این تراکنش، «${offerDeleteWorker.workerName}» دیگر هیچ سابقه‌ای (حضور، دفتر حساب، تخصیص لوازم یا نگهبانی) ندارد. آیا می‌خواهید خودِ این نیرو هم حذف شود؟ این کار اختیاری است و لازم نیست انجام شود.`
            : ""
        }
        confirmLabel="بله، نیرو هم حذف شود"
        cancelLabel="نه، فقط تراکنش کافی بود"
        loading={deleteWorkerMutation.isPending}
        onConfirm={() => offerDeleteWorker && deleteWorkerMutation.mutate(offerDeleteWorker.workerId)}
        onCancel={() => setOfferDeleteWorker(null)}
      />
    </Box>
  );
}
