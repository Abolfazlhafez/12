import { Box, Typography } from "@mui/material";
import { useEffect, useRef, useState, TouchEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import GroupsIcon from "@mui/icons-material/Groups";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ConstructionIcon from "@mui/icons-material/Construction";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { IconTabBar } from "../../shared/components/IconTabBar";
import { WorkersPage } from "../workers/WorkersPage";
import { EquipmentPage } from "../equipment/EquipmentPage";
import { CashbookSection } from "../reports/CashbookSection";

const TAB_COUNT = 3;
const SWIPE_THRESHOLD_PX = 60;
const VERTICAL_INTENT_RATIO = 1.2;

// همان الگوی صفحه‌های «فعالیت‌ها» و «مدیریت» — لینک مستقیم به یک زیرتب خاص
// از طریق پارامتر URL (مثلاً از نتیجهٔ جستجوی سراسری).
// «cashbook» طبق بازطراحی ناوبری از تب‌های «گزارش‌ها» به اینجا منتقل شد،
// چون دفتر حساب یک ابزار ثبت روزمره است (مثل نیروها/تجهیزات) نه یک
// گزارش؛ لینک‌های قدیمی «/reports?tab=cashbook» در ReportsPage به همین‌جا
// ریدایرکت می‌شوند، پس چیزی برای کاربران قدیمی نمی‌شکند.
// «attendance» دیگر زیرتب مستقلی نیست — حضور و غیاب داخل زیرتب «نیروها»
// ادغام شده (از کارت هر نیرو، دیالوگ حضور همان نیرو باز می‌شود). لینک‌های
// قدیمی «?tab=attendance» چون دیگر در این آرایه نیستند، به‌صورت طبیعی
// (indexOf === -1 → پیش‌فرض ۰) روی همان زیرتب «نیروها» می‌افتند.
const TAB_PARAM_VALUES = ["workers", "equipment", "cashbook"] as const;

/**
 * صفحه «تیم و تجهیزات»: ادغام نیروها (به‌همراه حضور و غیاب هر نیرو)،
 * تجهیزات و دفتر حساب در یک صفحه با زیرتب‌های مجزا، تا همه امکانات روزمرهٔ
 * مدیریت کارگاه در یک‌جا در دسترس باشد. (پیش‌تر با نام «منابع» شناخته می‌شد.)
 */
export function ResourcesPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = TAB_PARAM_VALUES.indexOf(tabParam as (typeof TAB_PARAM_VALUES)[number]);
  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const idx = TAB_PARAM_VALUES.indexOf(tabParam as (typeof TAB_PARAM_VALUES)[number]);
    if (idx >= 0) setTab(idx);
  }, [tabParam]);

  function handleChange(newValue: number) {
    setTab(newValue);
  }

  // سوایپ افقی بین زیرتب‌ها. برخلاف بخش‌های دیگر، اینجا هر چهار زیرتب از قبل
  // با display:none/block جابه‌جا می‌شوند (نه mount/unmount شرطی، تا فیلتر/اسکرول
  // هر زیرتب هنگام برگشت حفظ شود)، پس از کامپوننت مشترک SwipeableTabPanel
  // (که همیشه فقط تب فعال را mount می‌کند) استفاده نشده و منطق سوایپ این‌جا
  // جداگانه پیاده شده است.
  //
  // باگ قبلی: این هندلر بدون قید stopPropagation صدا می‌شد، پس حتی سوایپ
  // معتبری که این‌جا تب را عوض می‌کرد، همچنان تا کانتینر سوایپ *بیرونی*
  // صفحه (سوایپ بین برگه‌های نوار ناوبری پایین در AppLayout) هم بالا می‌رفت
  // و همان یک ژست، هم زیرتب داخلی و هم برگهٔ اصلی را عوض می‌کرد (دقیقاً
  // مطابق گزارش کاربر — سوایپ داخل «نیروها/تجهیزات» به داشبورد می‌رفت).
  // مطابق همان قاعده‌ای که در SwipeableTabPanel به کار رفته: فقط وقتی این
  // سوایپ واقعاً زیرتب را عوض می‌کند stopPropagation صدا زده می‌شود؛ روی
  // اولین/آخرین زیرتب که تغییری رخ نمی‌دهد، ژست آزاد می‌ماند تا به کانتینر
  // بیرونی برسد.
  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(dy) > Math.abs(dx) * VERTICAL_INTENT_RATIO) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;

    if (dx < 0 && tab < TAB_COUNT - 1) {
      e.stopPropagation();
      setTab(tab + 1);
    } else if (dx > 0 && tab > 0) {
      e.stopPropagation();
      setTab(tab - 1);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Typography variant="h5" fontWeight={700}>
        {t("resources.title")}
      </Typography>

      <IconTabBar
        value={tab}
        onChange={handleChange}
        items={[
          { label: t("resources.tabs.workers"), icon: <GroupsOutlinedIcon />, activeIcon: <GroupsIcon /> },
          { label: t("resources.tabs.equipment"), icon: <ConstructionOutlinedIcon />, activeIcon: <ConstructionIcon /> },
          { label: t("resources.tabs.cashbook"), icon: <ReceiptLongOutlinedIcon />, activeIcon: <ReceiptLongIcon /> },
        ]}
      />

      <Box onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Box sx={{ display: tab === 0 ? "block" : "none" }}>
          <WorkersPage embedded />
        </Box>
        <Box sx={{ display: tab === 1 ? "block" : "none" }}>
          <EquipmentPage embedded />
        </Box>
        <Box sx={{ display: tab === 2 ? "block" : "none" }}>
          <CashbookSection />
        </Box>
      </Box>
    </Box>
  );
}
