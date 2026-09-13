/**
 * تست تجربی واقعی منطق تشخیص زیرتبِ صفحهٔ «گزارش‌ها» بعد از بازطراحی دوم
 * ناوبری (انتقال تب «دفتر حساب» به صفحهٔ «تیم و تجهیزات»).
 *
 * این دقیقاً همان الزام صریح پرامپت اصلی است: تغییر ساختار Navigation
 * نباید لینک‌های قدیمی (بوکمارک‌شده یا از جاهای دیگر اپ) را بشکند. تست‌های
 * زیر هر دو مقدار فعلی، مقادیر قدیمی، مقدار منتقل‌شدهٔ «cashbook»، و چند
 * حالت لبه‌ای (null، مقدار ناشناخته، رشتهٔ خالی) را با مقایسهٔ مستقیم مقدار
 * بازگشتی بررسی می‌کنند.
 */

import { resolveTabParam, resolveTabIndex, TAB_PARAM_VALUES } from "../../pages/reports/reportsPageTabs";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, testName: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.log(`  ❌ ${testName}`);
    console.log(`     انتظار: ${JSON.stringify(expected)}`);
    console.log(`     دریافت: ${JSON.stringify(actual)}`);
  }
}

console.log("=".repeat(70));
console.log("تست ۱: مقادیر معتبر فعلی به‌درستی و بدون تغییر شناسایی می‌شوند");
console.log("=".repeat(70));
assertEqual(resolveTabParam("daily-monthly"), "daily-monthly", "'daily-monthly' بدون تغییر برمی‌گردد");
assertEqual(resolveTabParam("payroll-account"), "payroll-account", "'payroll-account' بدون تغییر برمی‌گردد");

console.log();
console.log("=".repeat(70));
console.log("تست ۲: لینک‌های قدیمی (قبل از ادغام Navigation) درست نگاشت می‌شوند");
console.log("   — این دقیقاً همان الزام 'لینک‌های قدیمی نباید بشکنند' است");
console.log("=".repeat(70));
assertEqual(
  resolveTabParam("payroll-cashbook"),
  "payroll-account",
  "لینک قدیمی 'payroll-cashbook' (خلاصهٔ حقوق+دفتر حساب با هم) به تب یکپارچهٔ جدید هدایت می‌شود"
);
assertEqual(
  resolveTabParam("worker-account"),
  "payroll-account",
  "لینک قدیمی 'worker-account' (تب مستقل سابق) هم به همان تب یکپارچهٔ جدید هدایت می‌شود"
);

console.log();
console.log("=".repeat(70));
console.log("تست ۳: 'cashbook' دیگر تب این صفحه نیست (به صفحهٔ دیگری منتقل شده)");
console.log("   — مسئولیت ریدایرکت واقعی‌اش با خودِ ReportsPage.tsx است، نه این فایل");
console.log("=".repeat(70));
assertEqual(
  resolveTabParam("cashbook"),
  null,
  "'cashbook' به هیچ تبی از این صفحه resolve نمی‌شود (چون تب دیگری از همین صفحه نیست)"
);
assertEqual(resolveTabIndex("cashbook"), -1, "اندیس 'cashbook' برابر -۱ است (کار ریدایرکت به /resources با خودِ ReportsPage.tsx است)");

console.log();
console.log("=".repeat(70));
console.log("تست ۴: مقادیر نامعتبر/خالی هیچ تبی را به‌اشتباه انتخاب نمی‌کنند");
console.log("=".repeat(70));
assertEqual(resolveTabParam(null), null, "مقدار null نتیجهٔ null می‌دهد (یعنی UI باید به تب پیش‌فرض برگردد)");
assertEqual(resolveTabParam(""), null, "رشتهٔ خالی نتیجهٔ null می‌دهد");
assertEqual(resolveTabParam("چیز-ناشناخته-تصادفی"), null, "یک مقدار کاملاً ناشناخته نتیجهٔ null می‌دهد");
assertEqual(resolveTabParam("Payroll-Account"), null, "حساسیت به بزرگ/کوچک بودن حروف رعایت می‌شود (تطبیق دقیق، نه فازی)");

console.log();
console.log("=".repeat(70));
console.log("تست ۵: اندیس تب برای رندر مستقیم SwipeableTabPanel صحیح است");
console.log("=".repeat(70));
assertEqual(resolveTabIndex("daily-monthly"), 0, "اندیس 'daily-monthly' برابر ۰ (تب اول) است");
assertEqual(resolveTabIndex("payroll-account"), 1, "اندیس 'payroll-account' برابر ۱ (تب دوم) است");
assertEqual(resolveTabIndex("worker-account"), 1, "اندیس لینک قدیمی 'worker-account' هم برابر ۱ (همان تب یکپارچه) است");
assertEqual(resolveTabIndex(null), -1, "بدون پارامتر، اندیس -1 برمی‌گردد (UI خودش پیش‌فرض ۰ را انتخاب می‌کند)");

console.log();
console.log("=".repeat(70));
console.log("تست ۶: تعداد مقادیر معتبر دقیقاً با تعداد تب‌های UI (۲ عدد) یکی است");
console.log("   — بعد از انتقال «دفتر حساب» به صفحهٔ «تیم و تجهیزات»");
console.log("=".repeat(70));
assertEqual(TAB_PARAM_VALUES.length, 2, "دقیقاً ۲ مقدار معتبر تعریف شده — هم‌راستا با ۲ تب در ReportsPage.tsx");

console.log();
console.log("=".repeat(70));
console.log(`نتیجه نهایی: ${passed} موفق، ${failed} ناموفق از مجموع ${passed + failed} بررسی`);
console.log("=".repeat(70));

if (failed > 0) {
  throw new Error(`${failed} بررسی ناموفق بود.`);
}
