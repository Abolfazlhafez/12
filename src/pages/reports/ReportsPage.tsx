import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import PaidIcon from "@mui/icons-material/Paid";
import { IconTabBar } from "../../shared/components/IconTabBar";
import { DailyAndMonthlyReportSection } from "./DailyAndMonthlyReportSection";
import { WorkerPayrollAndAccountSection } from "./WorkerPayrollAndAccountSection";
import { SwipeableTabPanel } from "../../shared/components/SwipeableTabPanel";
import { resolveTabIndex } from "./reportsPageTabs";

const TAB_COUNT = 2;

export function ReportsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = resolveTabIndex(tabParam);
  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0);

  useEffect(() => {
    const idx = resolveTabIndex(tabParam);
    if (idx >= 0) setTab(idx);
  }, [tabParam]);

  function handleChange(newValue: number) {
    setTab(newValue);
  }

  // «دفتر حساب» طبق بازطراحی ناوبری از این صفحه به تب‌های «تیم و تجهیزات»
  // منتقل شد (چون یک ابزار ثبت روزمره است، نه یک گزارش). لینک‌های قدیمی/
  // بوکمارک‌شدهٔ کاربران به «/reports?tab=cashbook» باید همچنان کار کنند،
  // پس این‌جا مستقیماً به مقصد جدید هدایت می‌شوند. این بررسی عمداً بعد از
  // فراخوانی همهٔ Hookها آمده (نه پیش از آن‌ها) تا قانون ثابت‌بودن ترتیب
  // Hookهای React نقض نشود؛ «cashbook» دیگر جزو تب‌های معتبر این صفحه
  // نیست، پس resolveTabIndex برایش -1 برمی‌گرداند و بدون این ریدایرکت،
  // کاربر به‌اشتباه تب پیش‌فرض را می‌دید، نه مقصد واقعی‌اش را.
  if (tabParam === "cashbook") {
    return <Navigate to="/resources?tab=cashbook" replace />;
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.reports")}
      </Typography>

      <IconTabBar
        value={tab}
        onChange={handleChange}
        items={[
          { label: t("reports.tabs.dailyMonthly"), icon: <CalendarMonthOutlinedIcon />, activeIcon: <CalendarMonthIcon /> },
          { label: t("reports.tabs.payroll"), icon: <PaidOutlinedIcon />, activeIcon: <PaidIcon /> },
        ]}
      />

      <SwipeableTabPanel activeIndex={tab} count={TAB_COUNT} onChangeIndex={setTab}>
        {tab === 0 && <DailyAndMonthlyReportSection />}
        {tab === 1 && <WorkerPayrollAndAccountSection />}
      </SwipeableTabPanel>
    </Box>
  );
}
