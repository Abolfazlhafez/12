import { Alert, Box, Button } from "@mui/material";
import { useTranslation } from "react-i18next";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useNavigate } from "react-router-dom";
import { MonthlyPayrollSummarySection } from "./MonthlyPayrollSummarySection";

/**
 * بخش «حقوق نیروها» (خلاصهٔ حقوق ماهانهٔ همهٔ نیروها با هم).
 *
 * «حساب تکی نیرو» (مانده طلب/بدهی و تسویه‌حساب یک نیروی خاص) که پیش‌تر یک
 * زیر-تب مستقل همین‌جا بود، جابه‌جا شده: حالا با زدن روی نام هر نیرو در
 * «منابع کارگاه ← نیروها»، پروفایل و حساب او با هم در یک دیالوگ باز می‌شود
 * (WorkerProfileDialog ← WorkerAccountSection با fixedWorkerId). این جابه‌جایی
 * منطقی‌تر است چون حساب هر نیرو بخشی از «پروندهٔ» همان نیرو است، نه یک گزارش
 * جدا؛ کد و منطق WorkerAccountSection دست‌نخورده و فقط محل نمایشش عوض شده.
 */
export function WorkerPayrollAndAccountSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Alert
        severity="info"
        icon={<AccountBalanceWalletIcon fontSize="inherit" />}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => navigate("/resources?tab=workers")}
            sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {t("reports.workerPayrollAccount.goToWorkers")}
          </Button>
        }
      >
        {t("reports.workerPayrollAccount.hint")}
      </Alert>

      <MonthlyPayrollSummarySection />
    </Box>
  );
}
