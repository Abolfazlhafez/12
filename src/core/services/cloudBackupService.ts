import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { settingsService } from "./settingsService";
import { backupService } from "./backupService";

/**
 * بکاپ ابری اختیاری — یک «آینهٔ» رمزنگاری‌شده از همان فایل بکاپ محلی
 * (backupService.exportAll)، که به‌جای فایل روی دیسک، در یک جدول ساده در
 * پروژهٔ شخصی Supabase کاربر ذخیره می‌شود.
 *
 * اصول طراحی:
 *  ۱. برنامه کاملاً آفلاین باقی می‌ماند. این سرویس هرگز در مسیر خواندن/
 *     نوشتن دادهٔ اصلی برنامه قرار نمی‌گیرد — فقط وقتی صریحاً صدا زده
 *     شود (توسط useCloudBackup یا کاربر با دکمهٔ «بکاپ ابری اکنون») و
 *     اتصال اینترنت موجود باشد، تلاش می‌کند.
 *  ۲. هیچ خطایی از این سرویس نباید تجربهٔ کاربر یا داده‌های محلی را مختل
 *     کند — قطعی اینترنت، خاموش‌بودن قابلیت، یا اشتباه در تنظیمات همگی
 *     باید بی‌صدا (یا با پیام قابل‌فهم در UI، نه throw غیرمنتظره در مسیر
 *     اصلی) مدیریت شوند.
 *  ۳. کلید/آدرس Supabase مخصوص حساب شخصی هر کاربر است و هرگز در کد
 *     هاردکد نمی‌شود؛ از settingsService (که در Dexie محلی ذخیره است)
 *     خوانده می‌شود.
 *  ۴. محتوایی که در Supabase قرار می‌گیرد، همان محتوای رمزنگاری‌شدهٔ
 *     backupService.exportAll() است — یعنی حتی اگر کسی به‌جز کاربر به
 *     جدول Supabase دسترسی پیدا کند (که با RLS باید غیرممکن باشد)،
 *     داده‌ها بدون رمز عبور/کلید دستگاهی خوانا نیستند.
 */

export interface CloudBackupConnectionTestResult {
  ok: boolean;
  message: string;
}

const TABLE_NAME = "karegah_yar_device_backups";

function getClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** آیا اتصال اینترنت در حال حاضر برقرار به‌نظر می‌رسد؟ (بررسی سطحی — درخواست واقعی خودش هم می‌تواند شکست بخورد، این فقط یک میان‌بر برای صرفه‌جویی است.) */
function isLikelyOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export const cloudBackupService = {
  /**
   * تست اتصال به Supabase با تنظیمات داده‌شده — بدون آپلود واقعی داده،
   * فقط یک درخواست سبک برای بررسی این‌که آدرس/کلید درست و جدول موجود است.
   * برای دکمهٔ «تست اتصال» در صفحهٔ تنظیمات استفاده می‌شود.
   */
  async testConnection(url: string, anonKey: string): Promise<CloudBackupConnectionTestResult> {
    if (!isLikelyOnline()) {
      return { ok: false, message: "دستگاه به اینترنت متصل نیست." };
    }
    try {
      const client = getClient(url, anonKey);
      const { error } = await client.from(TABLE_NAME).select("device_id").limit(1);
      if (error) {
        // اگر جدول اصلاً وجود نداشته باشد، پیام PostgREST معمولاً شامل
        // "does not exist" یا کد ۴۲P۰۱ است — برای کاربر توضیح می‌دهیم که
        // باید ابتدا جدول را طبق راهنما بسازد، نه فقط خطای خام Postgres.
        if (error.message.toLowerCase().includes("does not exist") || error.code === "42P01") {
          return {
            ok: false,
            message: `اتصال برقرار شد، ولی جدول «${TABLE_NAME}» در پروژهٔ Supabase شما یافت نشد. طبق راهنمای تنظیمات، ابتدا این جدول را بسازید.`,
          };
        }
        return { ok: false, message: `خطا در اتصال: ${error.message}` };
      }
      return { ok: true, message: "اتصال به Supabase با موفقیت برقرار شد." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "خطای ناشناخته در اتصال." };
    }
  },

  /**
   * اگر بکاپ ابری فعال باشد، اینترنت موجود باشد، و از آخرین بکاپ ابری
   * موفق به‌اندازهٔ کافی (طبق cloudBackupIntervalHours) گذشته باشد، یک
   * بکاپ تازه می‌سازد و در Supabase کاربر ذخیره می‌کند.
   *
   * این متد هرگز throw نمی‌کند — تمام خطاها بی‌صدا بلعیده می‌شوند، چون
   * این یک قابلیت پس‌زمینه‌ای است که نباید هیچ بخش دیگری از برنامه را
   * تحت تأثیر قرار دهد.
   */
  async runCloudBackupIfDue(): Promise<void> {
    try {
      const settings = await settingsService.get();
      if (!settings.cloudBackupEnabled) return;
      if (!settings.cloudBackupSupabaseUrl || !settings.cloudBackupSupabaseAnonKey) return;
      if (!isLikelyOnline()) return;

      const intervalMs = settings.cloudBackupIntervalHours * 60 * 60 * 1000;
      if (settings.lastCloudBackupAt) {
        const elapsedMs = Date.now() - new Date(settings.lastCloudBackupAt).getTime();
        if (elapsedMs < intervalMs) return;
      }

      // از همان مسیر رمزنگاری‌شدهٔ بکاپ محلی استفاده می‌کنیم — بدون رمز
      // عبور کاربر (که در این سناریوی خودکار در دسترس نیست)؛ یعنی با
      // کلید دستگاهی رمزنگاری می‌شود، دقیقاً مثل بکاپ خودکار محلی.
      const blob = await backupService.exportAll();
      const encryptedText = await blob.text();

      const client = getClient(settings.cloudBackupSupabaseUrl, settings.cloudBackupSupabaseAnonKey);
      const { error } = await client.from(TABLE_NAME).upsert({
        device_id: settings.cloudBackupDeviceId,
        payload: encryptedText,
        updated_at: new Date().toISOString(),
      });

      if (error) return; // بی‌صدا نادیده گرفته می‌شود؛ تلاش بعدی در فرصت بعدی انجام می‌شود.

      await settingsService.markCloudBackupDone(new Date().toISOString());
    } catch {
      // هر خطای غیرمنتظرهٔ دیگر (مثلاً قطع اینترنت وسط درخواست) هم بی‌صدا نادیده گرفته می‌شود.
    }
  },

  /** بازیابی از آخرین بکاپ ابری ذخیره‌شده — برای دستگاه جدید یا بعد از پاک‌شدن دادهٔ محلی. */
  async restoreFromCloud(url: string, anonKey: string, deviceId: string): Promise<void> {
    const client = getClient(url, anonKey);
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("payload")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) throw new Error(`خطا در دریافت بکاپ ابری: ${error.message}`);
    if (!data?.payload) throw new Error("هیچ بکاپ ابری‌ای برای این دستگاه یافت نشد.");

    const file = new File([data.payload as string], "cloud-backup.json", { type: "application/json" });
    await backupService.importAll(file);
  },
};
