/**
 * منطق تشخیص زیرتبِ صفحهٔ «گزارش‌ها» (ReportsPage) از روی پارامتر URL.
 *
 * این منطق عمداً از خودِ کامپوننت React جدا شده تا بدون نیاز به رندر کردن
 * هیچ UI، به‌صورت مستقیم و با داده‌های واقعی تست شود — چون این‌جا جایی است
 * که سازگاری با لینک‌های قدیمی (بعد از ادغام‌های Navigation) رعایت می‌شود؛
 * یک باگ ساکت این‌جا یعنی لینک‌های ذخیره‌شده/بوکمارک‌شدهٔ کاربران قدیمی
 * به تب اشتباه یا هیچ تبی هدایت نمی‌شوند.
 *
 * نکتهٔ مهم دربارهٔ «cashbook»: در بازطراحی دوم ناوبری، تب «دفتر حساب» از
 * این صفحه به صفحهٔ «تیم و تجهیزات» (/resources) منتقل شد، چون یک ابزار
 * ثبت روزمره است نه یک گزارش. به همین دلیل «cashbook» دیگر عضو
 * TAB_PARAM_VALUES این صفحه نیست و resolveTabParam/resolveTabIndex عمداً
 * برایش null/-1 برمی‌گردانند — مسئولیت هدایت واقعی این لینک قدیمی به مقصد
 * جدیدش با خودِ ReportsPage.tsx است (چون مقصد یک صفحهٔ کاملاً متفاوت است،
 * نه یک تب دیگر از همین صفحه)، نه با این فایل.
 */

// مقادیر معتبر فعلی، دقیقاً به همان ترتیب اندیس تب‌ها در UI.
export const TAB_PARAM_VALUES = ["daily-monthly", "payroll-account"] as const;
export type TabParamValue = (typeof TAB_PARAM_VALUES)[number];

// مقادیر قدیمی که پیش از ادغام‌های Navigation استفاده می‌شدند (ممکن است
// هنوز در بوکمارک یا کش مرورگر کاربران وجود داشته باشند). هرکدام به تب
// معادلش در ساختار جدید نگاشت می‌شود:
//   - «payroll-cashbook» (خلاصهٔ حقوق + دفتر حساب با هم) → «payroll-account»
//     (چون خودِ خلاصهٔ حقوق حالا در تب یکپارچهٔ حقوق/حساب نیرو جای دارد)
//   - «worker-account» (حساب نیرو، قبلاً تب مستقل) → «payroll-account»
//     (چون این بخش با خلاصهٔ حقوق ادغام شده)
export const LEGACY_TAB_PARAM_MAP: Record<string, TabParamValue> = {
  "payroll-cashbook": "payroll-account",
  "worker-account": "payroll-account",
};

/**
 * یک مقدار خام پارامتر URL (که می‌تواند null، یک مقدار معتبر فعلی، یک
 * مقدار قدیمی قابل‌نگاشت، یا کاملاً ناشناخته باشد) را به یک مقدار معتبر
 * فعلی (یا null اگر قابل تشخیص نبود) تبدیل می‌کند.
 */
export function resolveTabParam(raw: string | null): TabParamValue | null {
  if (!raw) return null;
  if ((TAB_PARAM_VALUES as readonly string[]).includes(raw)) return raw as TabParamValue;
  return LEGACY_TAB_PARAM_MAP[raw] ?? null;
}

/** اندیس تب متناظر با یک مقدار پارامتر خام، یا -1 اگر قابل تشخیص نبود. */
export function resolveTabIndex(raw: string | null): number {
  const resolved = resolveTabParam(raw);
  return resolved ? TAB_PARAM_VALUES.indexOf(resolved) : -1;
}
