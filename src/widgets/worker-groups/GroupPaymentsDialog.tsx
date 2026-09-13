import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import PaidIcon from "@mui/icons-material/Paid";
import { groupWagePaymentApi } from "../../shared/api/groupWagePaymentApi";
import { workersApi } from "../../shared/api/workersApi";
import { extractErrorMessage } from "../../shared/api/client";
import { useToast } from "../../shared/components/ToastProvider";
import { EmptyState } from "../../shared/components/EmptyState";
import { AnimatedList } from "../../shared/components/AnimatedList";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { getTodayIso, toJalaliDisplay } from "../../shared/utils/jalaliDate";
import { formatCurrency } from "../../shared/utils/format";
import { GroupPaymentSplitCalculator } from "./GroupPaymentSplitCalculator";
import type { WorkerGroup } from "../../entities/WorkerGroup";

interface GroupPaymentsDialogProps {
  open: boolean;
  group: WorkerGroup | null;
  onClose: () => void;
}

/**
 * تاریخچهٔ پرداخت‌های جمعی یک اکیپ + فرم ثبت پرداخت جدید. هر پرداخت یک
 * مبلغ کلی برای کل اکیپ است — نه سرانه — و این دیالوگ عمداً هیچ محاسبه یا
 * نمایشی از «سهم هرکس» ندارد، چون تقسیم مبلغ کاملاً داخلی خود اکیپ است.
 */
export function GroupPaymentsDialog({ open, group, onClose }: GroupPaymentsDialogProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [addFormOpen, setAddFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: payments = [] } = useQuery({
    queryKey: ["group-wage-payments", group?.id],
    queryFn: () => groupWagePaymentApi.listByGroup(group!.id),
    enabled: open && !!group,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["workers-for-groups"],
    queryFn: () => workersApi.list({ isActive: true }),
    enabled: open,
  });

  const members = (group?.memberWorkerIds ?? [])
    .map((id) => workers.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => !!w)
    .map((w) => ({ id: w.id, name: `${w.firstName} ${w.lastName}` }));

  const total = payments.reduce((sum, p) => sum + p.totalAmount, 0);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupWagePaymentApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-wage-payments", group?.id] });
      queryClient.invalidateQueries({ queryKey: ["cashbook"] });
      showToast("پرداخت جمعی حذف شد.", "success");
      setDeletingId(null);
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  const deletingPayment = payments.find((p) => p.id === deletingId) ?? null;

  if (!group) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              پرداخت‌های جمعی اکیپ {group.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {group.memberWorkerIds.length} عضو — جمع کل پرداخت‌شده: {formatCurrency(total)}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="بستن">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              هر مبلغ زیر، مبلغ کل قابل‌پرداخت به کل اکیپ برای همان کار است — نه سرانهٔ هر عضو. تقسیم آن بین اعضا به
              عهدهٔ خودشان است.
            </Typography>

            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddFormOpen(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              ثبت پرداخت جمعی جدید
            </Button>

            {payments.length === 0 ? (
              <EmptyState
                icon={<PaidIcon fontSize="inherit" />}
                title="هنوز پرداخت جمعی ثبت نشده"
                description="با دکمهٔ بالا اولین پرداخت کلی این اکیپ را برای یک کار مشخص ثبت کنید."
              />
            ) : (
              <AnimatedList spacing={1}>
                {payments.map((p) => (
                  <Box
                    key={p.id}
                    sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                  >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>
                          {p.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {toJalaliDisplay(p.date)}
                          {p.note ? ` — ${p.note}` : ""}
                        </Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={800} color="primary.main" whiteSpace="nowrap">
                        {formatCurrency(p.totalAmount)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="flex-end" mt={0.5}>
                      <Button size="small" color="error" onClick={() => setDeletingId(p.id)}>
                        حذف
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </AnimatedList>
            )}
          </Stack>
        </DialogContent>
      </Dialog>

      <AddGroupPaymentDialog
        open={addFormOpen}
        groupId={group.id}
        members={members}
        onClose={() => setAddFormOpen(false)}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="حذف پرداخت جمعی"
        description={
          deletingPayment
            ? `آیا از حذف پرداخت «${deletingPayment.label}» به مبلغ ${formatCurrency(
                deletingPayment.totalAmount
              )} مطمئن هستید؟ تراکنش مرتبط در دفتر حساب کلی هم حذف می‌شود.`
            : ""
        }
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
      />
    </>
  );
}

interface AddGroupPaymentDialogProps {
  open: boolean;
  groupId: string;
  members: { id: string; name: string }[];
  onClose: () => void;
}

function AddGroupPaymentDialog({ open, groupId, members, onClose }: AddGroupPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [label, setLabel] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [date, setDate] = useState(getTodayIso());
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      groupWagePaymentApi.create({
        groupId,
        label: label.trim(),
        totalAmount: Number(totalAmount) || 0,
        date,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-wage-payments", groupId] });
      queryClient.invalidateQueries({ queryKey: ["cashbook"] });
      showToast("پرداخت جمعی ثبت شد.", "success");
      setLabel("");
      setTotalAmount("");
      setNote("");
      setDate(getTodayIso());
      onClose();
    },
    onError: (err) => showToast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6" fontWeight={700}>
          پرداخت جمعی جدید
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="بستن">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={0.5}>
          <TextField
            label="بابت چه کاری"
            placeholder="مثلاً: گچ‌کاری طبقهٔ دوم"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <TextField
            label="مبلغ کل اکیپ (تومان)"
            type="number"
            inputProps={{ min: 0 }}
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            helperText="مبلغ کل برای کل اکیپ — سرانه نیست، خودشان بین خودشان تقسیم می‌کنند."
          />
          <TextField
            label="تاریخ"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField label="یادداشت (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />

          <GroupPaymentSplitCalculator
            members={members}
            totalAmount={Number(totalAmount) || 0}
            onApplyToNote={(text) => setNote((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit" disabled={createMutation.isPending}>
          انصراف
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          variant="contained"
          disabled={createMutation.isPending || !label.trim() || !(Number(totalAmount) > 0) || !date}
        >
          {createMutation.isPending ? "در حال ثبت..." : "ثبت پرداخت"}
        </Button>
      </Stack>
    </Dialog>
  );
}
