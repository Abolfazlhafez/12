import { useMemo, useState } from "react";
import { Box, Button, Checkbox, Collapse, Divider, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import { formatCurrency } from "../../shared/utils/format";

interface GroupMember {
  id: string;
  name: string;
}

interface GroupPaymentSplitCalculatorProps {
  members: GroupMember[];
  totalAmount: number;
  /** متن نهایی تقسیم را برمی‌گرداند تا کاربر بتواند آن را به یادداشت پرداخت اضافه کند. */
  onApplyToNote: (text: string) => void;
}

/**
 * یک ابزار کمکی و کاملاً اختیاری برای تقسیم مبلغ یک پرداخت جمعی بین اعضای
 * اکیپ — فقط برای کمک به سرکارگر در تقسیم عادلانهٔ پول، هیچ‌جا در سیستم
 * ذخیره نمی‌شود مگر این‌که خودِ کاربر آن را به یادداشت پرداخت اضافه کند.
 *
 * طبق طراحی عمدی اکیپ‌ها (رجوع کن به توضیح بالای GroupPaymentsDialog)، مبلغ
 * پرداخت جمعی هرگز به‌صورت خودکار یا رسمی بین اعضا سرشکن نمی‌شود؛ این‌جا
 * فقط یک ماشین‌حساب کمکی است، نه بخشی از حسابداری رسمی هر عضو.
 *
 * منطق: به‌صورت پیش‌فرض مبلغ به‌طور مساوی بین اعضای انتخاب‌شده تقسیم
 * می‌شود. کاربر می‌تواند مبلغ هرکسی را دستی عوض کند (مثلاً چون سرکارگر
 * سهم بیشتری می‌گیرد یا کسی نصف‌روز کار کرده)؛ باقیماندهٔ مبلغ به‌طور
 * خودکار و مساوی بین بقیهٔ اعضای دست‌نخورده تقسیم می‌شود.
 */
export function GroupPaymentSplitCalculator({ members, totalAmount, onApplyToNote }: GroupPaymentSplitCalculatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const included = members.filter((m) => !excludedIds.has(m.id));

  const shares = useMemo(() => {
    const overriddenTotal = included.reduce((sum, m) => {
      const raw = overrides[m.id];
      const n = raw !== undefined ? Number(raw) : NaN;
      return sum + (Number.isFinite(n) && raw?.trim() ? n : 0);
    }, 0);
    const unoverridden = included.filter((m) => !(overrides[m.id]?.trim() && Number.isFinite(Number(overrides[m.id]))));
    const remaining = Math.max(0, totalAmount - overriddenTotal);
    const equalShare = unoverridden.length > 0 ? Math.floor(remaining / unoverridden.length) : 0;

    const result = new Map<string, number>();
    included.forEach((m) => {
      const raw = overrides[m.id];
      if (raw?.trim() && Number.isFinite(Number(raw))) {
        result.set(m.id, Number(raw));
      } else {
        result.set(m.id, equalShare);
      }
    });
    return result;
  }, [included, overrides, totalAmount]);

  const sumOfShares = Array.from(shares.values()).reduce((a, b) => a + b, 0);
  const diff = totalAmount - sumOfShares;

  function toggleMember(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildNoteText(): string {
    const lines = included.map((m) => `${m.name}: ${formatCurrency(shares.get(m.id) ?? 0)}`);
    return `تقسیم پیشنهادی بین اعضا:\n${lines.join("\n")}`;
  }

  if (members.length === 0) return null;

  return (
    <Box>
      <Button
        size="small"
        startIcon={<CalculateIcon fontSize="small" />}
        onClick={() => setExpanded((e) => !e)}
        sx={{ alignSelf: "flex-start" }}
      >
        {expanded ? "بستن ماشین‌حساب تقسیم" : "کمک به تقسیم بین اعضا (اختیاری)"}
      </Button>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" component="div" mb={1}>
            این فقط یک ماشین‌حساب کمکی برای تقسیم عادلانهٔ مبلغ بین اعضاست — جایی در حساب فردی
            کسی ثبت نمی‌شود، مگر این‌که با دکمهٔ پایین آن را به یادداشت همین پرداخت اضافه کنید.
            به‌صورت پیش‌فرض مساوی تقسیم می‌شود؛ مبلغ هرکس را می‌توانید دستی عوض کنید.
          </Typography>

          <Stack spacing={1}>
            {members.map((m) => {
              const isExcluded = excludedIds.has(m.id);
              return (
                <Stack key={m.id} direction="row" alignItems="center" spacing={1}>
                  <Checkbox
                    size="small"
                    checked={!isExcluded}
                    onChange={() => toggleMember(m.id)}
                    sx={{ p: 0.5 }}
                  />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {m.name}
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    disabled={isExcluded}
                    placeholder={isExcluded ? "—" : String(shares.get(m.id) ?? 0)}
                    value={overrides[m.id] ?? ""}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">تومان</InputAdornment>,
                    }}
                    sx={{ width: 180 }}
                  />
                </Stack>
              );
            })}
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color={diff !== 0 ? "warning.main" : "text.secondary"}>
              {diff === 0
                ? `جمع تقسیم‌شده برابر مبلغ کل (${formatCurrency(totalAmount)}) است.`
                : `اختلاف با مبلغ کل: ${formatCurrency(diff)} (به‌خاطر رند شدن مبالغ مساوی، طبیعی است).`}
            </Typography>
          </Stack>

          <Button
            size="small"
            variant="outlined"
            sx={{ mt: 1.5 }}
            disabled={included.length === 0}
            onClick={() => onApplyToNote(buildNoteText())}
          >
            افزودن این تقسیم به یادداشت پرداخت
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}
