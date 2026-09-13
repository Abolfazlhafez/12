import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type Dexie from "dexie";
import { db, ensureDatabaseSeeded, DEVICE_SECRET_ROW_ID, type DeviceSecretRow } from "../db";
import { settingsService } from "./settingsService";
import { getTodayIso } from "../../shared/utils/jalaliDate";
import {
  encryptWithDeviceKey,
  decryptWithDeviceKey,
  encryptWithPassword,
  decryptWithPassword,
  isEncryptedPayloadShape,
  generateDeviceKeyBase64,
  type EncryptedPayload,
} from "./backupCrypto";

/**
 * پشتیبان‌گیری و بازیابی کامل دیتابیس محلی.
 * چون برنامه کاملاً آفلاین و روی یک دستگاه اجرا می‌شود، این تنها راه انتقال
 * اطلاعات بین دستگاه‌ها یا نگهداری نسخه پشتیبان است.
 *
 * دو مسیر بکاپ وجود دارد:
 * ۱. بکاپ دستی: کاربر با یک دکمه، فایل JSON را دانلود/اشتراک می‌گذارد (خروج از اپ).
 * ۲. بکاپ خودکار دوره‌ای: بدون دخالت کاربر، در حافظهٔ داخلی خود اپ (Directory.Data)
 *    نسخه‌بندی‌شده ذخیره می‌شود تا در صورت کرش یا بسته‌شدن غیرمنتظرهٔ اپ، اطلاعات
 *    از دست نرود. این پوشه بین اجراهای اپ باقی می‌ماند (per-app storage اندروید)
 *    و به اینترنت هیچ وابستگی ندارد.
 */

const BACKUP_VERSION = 1;
const AUTO_BACKUP_DIR = "auto-backups";
const AUTO_BACKUP_FILE_PREFIX = "auto-backup-";

// --- نسخهٔ فایلی کلید دستگاهی (علت وجودی این بخش را در getOrCreateDeviceKey بخوانید) ---
const DEVICE_KEY_FILE_NAME = "device-key.json";

// --- بکاپ اضافی در پوشه اندروید (قابل مشاهده با فایل‌منیجر، جدا از حافظهٔ
// داخلی خصوصی اپ) — علاوه بر بکاپ داخلی، نه به‌جای آن. نگهداری بر اساس
// تعداد روز (نه تعداد نسخه): هر نسخه دقیقاً ۱۵ روز نگه داشته می‌شود.
const EXTERNAL_BACKUP_DIR = "KaregahYar/backups";
const EXTERNAL_BACKUP_RETENTION_DAYS = 15;

// --- فهرست جدول‌های قابل پشتیبان‌گیری ---
//
// چرا این لیست هنوز صراحتاً نوشته شده (نه فقط db.tables خام): چون بعضی
// جدول‌ها (مثل deviceSecrets) باید عمداً از بکاپ مستثنا بمانند. اما برخلاف
// نسخهٔ قبلی که این لیست را در سه جای مجزا (نوع، خواندن، نوشتن) تکرار
// می‌کرد، حالا:
//   ۱. این‌جا فقط یک منبع واحد است.
//   ۲. تابع assertBackupTableListIsComplete در پایین فایل، این لیست را در
//      هر اجرای Backup با فهرست واقعی db.tables (که مستقیماً از خودِ
//      schema در Dexie می‌آید) مقایسه می‌کند و اگر جدولی در schema باشد
//      که این‌جا فراموش شده، بلافاصله خطا پرتاب می‌کند — یعنی اگر فردا
//      Entity/جدول جدیدی اضافه شود ولی کسی فراموش کند این‌جا هم اضافه‌اش
//      کند، اولین بار که کسی روی برنامه Backup بگیرد متوجه می‌شود، نه
//      این‌که بی‌صدا و برای همیشه از بکاپ‌ها جا بیفتد.
const DEVICE_ONLY_TABLE_NAMES = ["deviceSecrets"] as const;

export const BACKUP_TABLE_NAMES = [
  "workers",
  "attendances",
  "breakTimes",
  "timeLosses",
  "equipment",
  "equipmentAssignments",
  "ledgerEntries",
  "cashbookEntries",
  "cashboxFunds",
  "optionalLeaves",
  "jobTypes",
  "wageMethods",
  "wageAssignments",
  "wageCalculations",
  "settings",
  "photos",
  "pictureCards",
  "futureActivities",
  "guardShifts",
  "dailyReportNotes",
  "workLogNotes",
  "floors",
  "floorStages",
  "floorTasks",
  "floorPlans",
  "floorIssues",
  "floorWorkers",
  "floorChecklistItems",
  "floorActivityEvents",
  "projects",
  "projectWorkers",
  "workerGroups",
  "groupWagePayments",
  "voiceNotes",
] as const;

type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];

/**
 * بررسی می‌کند که فهرست ثابت BACKUP_TABLE_NAMES دقیقاً با فهرست واقعی
 * جدول‌های موجود در schema دیتابیس (منهای جدول‌های عمداً مستثنا مثل
 * deviceSecrets) یکی باشد. اگر جدولی در schema باشد که این‌جا نیامده،
 * خطای مشخص پرتاب می‌شود — این دقیقاً همان «مکانیسم اعتبارسنجی» است که
 * پرامپت اصلی درخواست کرده: Backup نباید بتواند بی‌صدا داده‌ای را جا بیندازد.
 *
 * export شده (نه فقط داخلی) تا در تست‌های تجربی مستقیماً و بدون نیاز به
 * فراخوانی کامل exportAll() قابل بررسی باشد.
 */
export function assertBackupTableListIsComplete(): void {
  const actualTableNames = db.tables.map((t) => t.name);
  const expectedSet = new Set<string>([...BACKUP_TABLE_NAMES, ...DEVICE_ONLY_TABLE_NAMES]);
  const missingFromList = actualTableNames.filter((name) => !expectedSet.has(name));
  if (missingFromList.length > 0) {
    throw new Error(
      `خطای داخلی سیستم پشتیبان‌گیری: جدول(های) [${missingFromList.join(
        ", "
      )}] در دیتابیس تعریف شده‌اند ولی در فهرست BACKUP_TABLE_NAMES نیستند. ` +
        `این یعنی داده‌های این جدول(ها) در Backup گنجانده نمی‌شوند — قبل از ادامه، آن‌ها را به BACKUP_TABLE_NAMES` +
        ` (یا در صورت عمدی‌بودن، به DEVICE_ONLY_TABLE_NAMES) در backupService.ts اضافه کنید.`
    );
  }
}

interface BackupFile {
  app: "karegah-yar";
  version: number;
  exportedAt: string;
  // photos و voiceNotes فرمت خاص خودشان را دارند (شامل blobBase64)؛ بقیهٔ
  // جدول‌ها آرایهٔ خام رکوردها هستند. به همین دلیل این دو جدول به‌صورت
  // جداگانه از بقیهٔ جدول‌های عمومی نگه داشته می‌شوند.
  tables: Partial<Record<Exclude<BackupTableName, "photos" | "voiceNotes">, unknown[]>> & {
    photos: { meta: unknown; blobBase64: string; displayBlobBase64?: string }[];
    voiceNotes: { meta: unknown; blobBase64: string }[];
  };
}

export interface AutoBackupInfo {
  /** نام فایل، شامل برچسب زمانی */
  fileName: string;
  /** زمان ساخت این بکاپ (ISO string، استخراج‌شده از نام فایل) */
  createdAt: string;
  /** حجم فایل بر حسب بایت (در صورت در دسترس بودن) */
  sizeBytes?: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

interface DeviceKeyFilePayload {
  deviceKeyBase64: string;
  createdAt: string;
}

/**
 * خواندن نسخهٔ فایلیِ کلید دستگاهی (در Directory.Data، مستقل از IndexedDB).
 * نبودِ فایل یا هر خطای دیگر خاموش نادیده گرفته می‌شود؛ این فقط یک نسخهٔ
 * پشتیبانِ کلید است، نه منبع اصلی.
 */
async function readDeviceKeyFile(): Promise<DeviceKeyFilePayload | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await Filesystem.readFile({
      path: DEVICE_KEY_FILE_NAME,
      directory: Directory.Data,
      encoding: "utf8" as never,
    });
    const text = typeof result.data === "string" ? result.data : await (result.data as Blob).text();
    const parsed = JSON.parse(text) as Partial<DeviceKeyFilePayload>;
    if (parsed && typeof parsed.deviceKeyBase64 === "string" && typeof parsed.createdAt === "string") {
      return parsed as DeviceKeyFilePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** نوشتن نسخهٔ فایلیِ کلید دستگاهی. خطا در این‌جا نباید مانع کارکرد اصلی برنامه شود. */
async function writeDeviceKeyFile(payload: DeviceKeyFilePayload): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.writeFile({
      path: DEVICE_KEY_FILE_NAME,
      directory: Directory.Data,
      data: JSON.stringify(payload),
      encoding: "utf8" as never,
    });
  } catch {
    // نوشتن نسخهٔ فایلی صرفاً یک لایهٔ افزونهٔ مقاومت است؛ اگر شکست بخورد،
    // IndexedDB همچنان به‌عنوان منبع اصلی کار می‌کند.
  }
}

/**
 * خواندن (و در صورت نبود، ساخت) کلید رمزنگاری دستگاهی.
 *
 * چرا دو منبع (IndexedDB و یک فایل جدا در Directory.Data) نگه‌داری می‌شود:
 * روی اندروید/WebView، دادهٔ IndexedDB و فایل‌های بومی Capacitor از نظر
 * فنی هر دو داخل حافظهٔ اختصاصی اپ هستند، ولی همیشه با هم پاک نمی‌شوند —
 * برای نمونه پاک‌کردن دادهٔ WebView (یا بازنشانی آن توسط خودِ سیستم تحت
 * فشار حافظه) می‌تواند IndexedDB را خالی کند در حالی که فایل‌های بکاپ
 * خودکار (که در همان Directory.Data ولی به‌صورت فایل معمولی ذخیره
 * می‌شوند) دست‌نخورده باقی می‌مانند. قبل از این تغییر، در چنین حالتی
 * getOrCreateDeviceKey چون ردیفی در deviceSecrets پیدا نمی‌کرد، یک کلید
 * کاملاً تازه می‌ساخت — و همان بکاپ‌های دست‌نخوردهٔ روی دیسک برای همیشه
 * غیرقابل‌رمزگشایی می‌شدند («فایل خراب یا دستکاری‌شده» با این‌که واقعاً
 * خراب نبودند). حالا قبل از ساختن کلید تازه، نسخهٔ فایلی هم بررسی و در
 * صورت وجود بازیابی می‌شود؛ و هر بار که این تابع صدا زده می‌شود، هر دو
 * منبع با هم همگام نگه داشته می‌شوند.
 */
async function getOrCreateDeviceKey(): Promise<string> {
  await ensureDatabaseSeeded(); // خودش کلید را در اولین اجرا می‌سازد اگر نبود.
  const dbRow = await db.deviceSecrets.get(DEVICE_SECRET_ROW_ID);
  const fileRow = await readDeviceKeyFile();

  if (dbRow) {
    // اگر نسخهٔ فایلی هنوز نیست یا با نسخهٔ IndexedDB فرق دارد، IndexedDB
    // به‌عنوان منبع اصلی در نظر گرفته می‌شود (چون همیشه بوده) و فایل با آن
    // هماهنگ می‌شود.
    if (!fileRow || fileRow.deviceKeyBase64 !== dbRow.deviceKeyBase64) {
      await writeDeviceKeyFile({ deviceKeyBase64: dbRow.deviceKeyBase64, createdAt: dbRow.createdAt });
    }
    return dbRow.deviceKeyBase64;
  }

  if (fileRow) {
    // دقیقاً همان سناریویی که این تغییر برایش نوشته شده: IndexedDB خالی
    // شده ولی نسخهٔ فایلی باقی مانده — به‌جای ساختن کلید تازه، همین کلید
    // قدیمی در IndexedDB هم بازنویسی می‌شود تا بکاپ‌های قبلی همچنان
    // قابل‌رمزگشایی بمانند.
    const restored: DeviceSecretRow = { id: DEVICE_SECRET_ROW_ID, ...fileRow };
    await db.deviceSecrets.put(restored);
    return fileRow.deviceKeyBase64;
  }

  // هیچ‌کدام موجود نیست — واقعاً اولین اجرا. کلید تازه ساخته و در هر دو
  // منبع ذخیره می‌شود.
  const fresh: DeviceSecretRow = {
    id: DEVICE_SECRET_ROW_ID,
    deviceKeyBase64: generateDeviceKeyBase64(),
    createdAt: new Date().toISOString(),
  };
  await db.deviceSecrets.put(fresh);
  await writeDeviceKeyFile({ deviceKeyBase64: fresh.deviceKeyBase64, createdAt: fresh.createdAt });
  return fresh.deviceKeyBase64;
}

/**
 * پوشش نهایی یک بستهٔ رمزنگاری‌شده که روی دیسک/در حافظه ذخیره می‌شود —
 * یک لایهٔ نازک JSON دور EncryptedPayload، فقط برای این‌که در آینده (مثلاً
 * وقتی الگوریتم رمزنگاری عوض شود) بشود نسخه را تشخیص داد.
 */
interface EncryptedBackupFile {
  encrypted: true;
  formatVersion: 1;
  payload: EncryptedPayload;
}

function isEncryptedBackupFile(value: unknown): value is EncryptedBackupFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.encrypted === true && v.formatVersion === 1 && isEncryptedPayloadShape(v.payload);
}

/** رمزنگاری متن JSON بکاپ و بازگرداندن رشتهٔ نهایی قابل نوشتن روی فایل. */
async function encryptBackupJson(json: string, password: string | null): Promise<string> {
  const payload = password ? await encryptWithPassword(json, password) : await encryptWithDeviceKey(json, await getOrCreateDeviceKey());
  const wrapped: EncryptedBackupFile = { encrypted: true, formatVersion: 1, payload };
  return JSON.stringify(wrapped);
}

/**
 * رمزگشایی محتوای یک فایل بکاپ و بازگرداندن متن JSON خام آن.
 *
 * سازگاری با فایل‌های قدیمی: اگر محتوا اصلاً بستهٔ رمزنگاری‌شده نباشد (یعنی
 * قبل از افزوده‌شدن رمزنگاری ساخته شده)، همان متن به‌عنوان JSON خام
 * برگردانده می‌شود — تا بکاپ‌های قدیمی کاربران هم همچنان قابل Restore بمانند.
 */
async function decryptBackupJson(fileText: string, password: string | null): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("فایل پشتیبان یک JSON معتبر نیست.");
  }

  if (!isEncryptedBackupFile(parsed)) {
    // فایل بکاپ قدیمی (رمزنگاری‌نشده) — برای حفظ سازگاری عقب‌رو همان‌طور
    // که هست پذیرفته می‌شود.
    return fileText;
  }

  if (parsed.payload.keySource === "password") {
    if (!password) {
      throw new Error("این فایل پشتیبان با رمز عبور محافظت شده است. لطفاً رمز عبور را وارد کنید.");
    }
    return decryptWithPassword(parsed.payload, password);
  }

  // keySource === "device"
  const deviceKey = await getOrCreateDeviceKey();
  return decryptWithDeviceKey(parsed.payload, deviceKey);
}

/** ساخت شیء BackupFile از وضعیت فعلی دیتابیس. */
async function buildBackupPayload(): Promise<BackupFile> {
  // اعتبارسنجی جنریک: قبل از هر کاری مطمئن شو هیچ جدولی در schema فراموش
  // نشده. اگر جدول جدیدی اضافه شده و این‌جا لحاظ نشده باشد، همین‌جا و با
  // پیام واضح متوقف می‌شویم — نه این‌که Backup «موفق» ولی ناقص بسازیم.
  assertBackupTableListIsComplete();

  // جدول‌های عمومی (غیر از photos/voiceNotes که فرمت مخصوص به خودشان دارند)
  // را یک‌جا و پویا از روی BACKUP_TABLE_NAMES می‌خوانیم — افزودن جدول جدید
  // در آینده فقط به یک خط در BACKUP_TABLE_NAMES نیاز دارد، نه تغییر در این تابع.
  const genericTableNames = BACKUP_TABLE_NAMES.filter((name) => name !== "photos" && name !== "voiceNotes");
  const genericTablesData = await Promise.all(
    genericTableNames.map((name) => (db[name] as Dexie.Table<unknown, string>).toArray())
  );
  const genericTables = Object.fromEntries(
    genericTableNames.map((name, i) => [name, genericTablesData[i]])
  ) as Partial<Record<Exclude<BackupTableName, "photos" | "voiceNotes">, unknown[]>>;

  const photos = await db.photos.toArray();
  const photosEncoded = await Promise.all(
    photos.map(async (p) => {
      const { blob, displayBlob, ...meta } = p;
      return {
        meta,
        blobBase64: await blobToBase64(blob),
        displayBlobBase64: displayBlob ? await blobToBase64(displayBlob) : undefined,
      };
    })
  );

  const voiceNotes = await db.voiceNotes.toArray();
  const voiceNotesEncoded = await Promise.all(
    voiceNotes.map(async (v) => {
      const { blob, ...meta } = v;
      return { meta, blobBase64: await blobToBase64(blob) };
    })
  );

  return {
    app: "karegah-yar",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      ...genericTables,
      photos: photosEncoded,
      voiceNotes: voiceNotesEncoded,
    },
  };
}

/** جایگزینی کامل محتوای دیتابیس با یک BackupFile معتبر. */
async function restoreFromPayload(backup: BackupFile): Promise<void> {
  if (backup.app !== "karegah-yar" || !backup.tables) {
    throw new Error("فایل پشتیبان معتبر نیست.");
  }

  const photos = backup.tables.photos.map((p) => {
    const meta = p.meta as Record<string, unknown>;
    return {
      ...meta,
      blob: base64ToBlob(p.blobBase64, (meta.mimeType as string) || "image/jpeg"),
      displayBlob: p.displayBlobBase64 ? base64ToBlob(p.displayBlobBase64, "image/jpeg") : undefined,
    };
  });

  // فایل‌های بکاپ قدیمی‌تر (قبل از افزودن voiceNotes) این کلید را اصلاً
  // نخواهند داشت — با ?? [] بدون خطا نادیده گرفته می‌شود.
  const voiceNotes = (backup.tables.voiceNotes ?? []).map((v) => {
    const meta = v.meta as Record<string, unknown>;
    return {
      ...meta,
      blob: base64ToBlob(v.blobBase64, (meta.mimeType as string) || "audio/webm"),
    };
  });

  await db.transaction("rw", BACKUP_TABLE_NAMES.map((name) => db[name] as Dexie.Table<unknown, string>), async () => {
    // پاک‌سازی همهٔ جدول‌ها به‌صورت پویا از روی BACKUP_TABLE_NAMES — افزودن
    // جدول جدید در آینده نیازی به تغییر این خط ندارد.
    await Promise.all(BACKUP_TABLE_NAMES.map((name) => (db[name] as Dexie.Table<unknown, string>).clear()));

    // نوشتن مجدد هر جدول از روی backup.tables، با ?? [] برای سازگاری با
    // فایل‌های بکاپ قدیمی‌تر که ممکن است این جدول را (چون هنوز اضافه نشده
    // بود) نداشته باشند — هیچ جدولی نباید باعث شکست کل Restore شود.
    await Promise.all(
      BACKUP_TABLE_NAMES.filter((name) => name !== "photos" && name !== "voiceNotes").map((name) =>
        (db[name] as Dexie.Table<unknown, string>).bulkAdd((backup.tables[name] ?? []) as never[])
      )
    );
    await db.photos.bulkAdd(photos as never[]);
    await db.voiceNotes.bulkAdd(voiceNotes as never[]);
  });

  await ensureDatabaseSeeded();
}

/** اطمینان از وجود پوشهٔ بکاپ‌های خودکار در حافظهٔ داخلی اپ. */
async function ensureAutoBackupDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: AUTO_BACKUP_DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // اگر از قبل وجود داشته باشد، mkdir خطا می‌دهد؛ قابل‌چشم‌پوشی است.
  }
}

function fileNameFor(timestamp: string): string {
  // ":" در نام فایل روی برخی سیستم‌عامل‌ها مجاز نیست؛ جایگزین می‌شود.
  const safe = timestamp.replace(/:/g, "-");
  return `${AUTO_BACKUP_FILE_PREFIX}${safe}.json`;
}

/** اطمینان از وجود پوشهٔ بکاپ در حافظهٔ خارجی/عمومی اپ (قابل دیدن با فایل‌منیجر). */
async function ensureExternalAutoBackupDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: EXTERNAL_BACKUP_DIR,
      directory: Directory.External,
      recursive: true,
    });
  } catch {
    // اگر از قبل وجود داشته باشد، mkdir خطا می‌دهد؛ قابل‌چشم‌پوشی است.
  }
}

/**
 * کپی یک نسخه از بکاپ در پوشهٔ عمومی اندروید (Directory.External)، علاوه بر
 * نسخهٔ داخلی خصوصی اپ. این مسیر با فایل‌منیجر روی گوشی قابل دسترسی است.
 * خطا در این مرحله نباید مانع بکاپ اصلی (داخلی) شود، پس کاملاً بی‌صدا مدیریت می‌شود.
 */
async function copyBackupToExternalFolder(json: string, fileName: string): Promise<void> {
  try {
    await ensureExternalAutoBackupDir();
    await Filesystem.writeFile({
      path: `${EXTERNAL_BACKUP_DIR}/${fileName}`,
      directory: Directory.External,
      data: json,
      encoding: "utf8" as never,
    });
  } catch {
    // عدم دسترسی به حافظه خارجی نباید کل فرآیند بکاپ‌گیری را متوقف کند.
  }
}

/** حذف نسخه‌های بکاپ خارجی که بیش از ۱۵ روز از ساخته‌شدنشان گذشته است. */
async function pruneExternalBackupsOlderThanRetention(): Promise<void> {
  try {
    const result = await Filesystem.readdir({
      path: EXTERNAL_BACKUP_DIR,
      directory: Directory.External,
    });

    const cutoff = Date.now() - EXTERNAL_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const f of result.files) {
      const name = typeof f === "string" ? f : f.name;
      const createdAt = timestampFromFileName(name);
      if (!createdAt) continue;
      const createdMs = new Date(createdAt).getTime();
      if (isNaN(createdMs) || createdMs >= cutoff) continue;

      try {
        await Filesystem.deleteFile({
          path: `${EXTERNAL_BACKUP_DIR}/${name}`,
          directory: Directory.External,
        });
      } catch {
        // در صورت خطا در حذف یک فایل، از بقیهٔ پاک‌سازی صرف‌نظر نمی‌کنیم.
      }
    }
  } catch {
    // پوشه هنوز ساخته نشده یا در دسترس نیست؛ چیزی برای حذف وجود ندارد.
  }
}

function timestampFromFileName(fileName: string): string | null {
  if (!fileName.startsWith(AUTO_BACKUP_FILE_PREFIX) || !fileName.endsWith(".json")) return null;
  const safe = fileName.slice(AUTO_BACKUP_FILE_PREFIX.length, -".json".length);
  // بازگرداندن ":" در بخش زمان (ساعت-دقیقه-ثانیه) برای پارس‌شدن به‌عنوان تاریخ معتبر.
  const restored = safe.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const date = new Date(restored);
  return isNaN(date.getTime()) ? null : restored;
}

export const backupService = {
  /**
   * ساخت یک فایل JSON رمزنگاری‌شده شامل تمام داده‌های برنامه (شامل خود
   * عکس‌ها به‌صورت base64). برای دانلود/اشتراک‌گذاری دستی توسط کاربر
   * استفاده می‌شود.
   *
   * اگر password داده شود، فایل با کلید مشتق‌شده از همان رمز عبور
   * رمزنگاری می‌شود (مناسب برای انتقال بین دستگاه‌ها یا اشتراک‌گذاری با
   * دیگران). اگر داده نشود، با کلید دستگاهی رمزنگاری می‌شود (کاربر چیزی
   * وارد نمی‌کند، ولی فایل همچنان قابل مشاهدهٔ ساده نیست).
   */
  async exportAll(password?: string): Promise<Blob> {
    const backup = await buildBackupPayload();
    const json = JSON.stringify(backup);
    const encryptedJson = await encryptBackupJson(json, password || null);
    return new Blob([encryptedJson], { type: "application/json" });
  },

  /**
   * پشتیبان‌گیری «یک‌لمسی»: هم فایل را می‌سازد و هم بلافاصله آن را دانلود یا
   * (روی اندروید) از طریق منوی اشتراک‌گذاری بومی در اختیار کاربر می‌گذارد —
   * دقیقاً همان منطقی که پیش‌تر فقط داخل صفحهٔ تنظیمات به‌صورت محلی نوشته شده
   * بود؛ حالا در یک‌جا (اینجا) نگه‌داری می‌شود تا هم از تنظیمات و هم از هر
   * نقطهٔ دیگری از اپ (مثلاً یک دکمهٔ سریع در داشبورد) قابل استفاده باشد.
   */
  async exportAndShare(password?: string): Promise<void> {
    const blob = await this.exportAll(password);
    const stamp = getTodayIso();
    const filename = `karegah-yar-backup-${stamp}.json`;

    if (Capacitor.isNativePlatform()) {
      const base64 = await blobToBase64(blob);
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: filename,
        files: [result.uri],
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  },

  /**
   * بازیابی از فایل پشتیبان انتخاب‌شده توسط کاربر. این عملیات کل دیتابیس فعلی را
   * پاک و جایگزین می‌کند.
   *
   * اگر فایل با رمز عبور محافظت شده باشد و password داده نشده باشد، یک خطای
   * مشخص («این فایل پشتیبان با رمز عبور محافظت شده است...») پرتاب می‌شود —
   * UI باید این خطا را بگیرد و از کاربر رمز عبور بخواهد.
   */
  async importAll(file: File, password?: string): Promise<void> {
    const text = await file.text();
    const decryptedJson = await decryptBackupJson(text, password || null);
    const backup = JSON.parse(decryptedJson) as BackupFile;
    await restoreFromPayload(backup);
  },

  // ------------------------------------------------------------------
  // بکاپ خودکار دوره‌ای (داخل حافظهٔ اپ، بدون دخالت کاربر)
  // ------------------------------------------------------------------

  /**
   * در صورت لزوم (بر اساس تنظیمات کاربر و زمان آخرین بکاپ)، یک بکاپ خودکار جدید
   * می‌سازد و نسخه‌های اضافی قدیمی را حذف می‌کند. فقط روی پلتفرم بومی (اندروید)
   * فعال است؛ چون در مرورگر معمولی جای مطمئنی برای نوشتن فایل وجود ندارد.
   *
   * این متد امن است تا در هر بار باز شدن اپ صدا زده شود؛ اگر هنوز زمانش نرسیده
   * باشد یا غیرفعال باشد، کاری انجام نمی‌دهد.
   */
  async runAutoBackupIfDue(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    const settings = await settingsService.get();
    if (!settings.autoBackupEnabled) return false;

    const intervalMs = settings.autoBackupIntervalHours * 60 * 60 * 1000;
    const last = settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).getTime() : 0;
    const due = Date.now() - last >= intervalMs;
    if (!due) return false;

    await this.createAutoBackup();
    return true;
  },

  /**
   * بلافاصله یک بکاپ خودکار جدید می‌سازد (صرف‌نظر از زمان‌بندی) و نسخه‌های
   * اضافی قدیمی را طبق تنظیمات کاربر حذف می‌کند.
   *
   * هر خطایی در این مسیر (چه از فراخوانی خودکار دوره‌ای، چه از دکمهٔ دستی
   * «ساخت بکاپ داخلی همین حالا») قبل از پرتاب مجدد، در settings ثبت می‌شود
   * (markAutoBackupError) — قبلاً مسیر خودکار این خطاها را کاملاً بی‌صدا
   * می‌بلعید (رجوع کن به useAutoBackup) و کاربر هیچ نشانه‌ای نمی‌دید.
   */
  async createAutoBackup(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      // در محیط غیر بومی (مرورگر توسعه)، فایل‌سیستم پایدار در دسترس نیست.
      return;
    }

    try {
      await ensureAutoBackupDir();

      const backup = await buildBackupPayload();
      const json = JSON.stringify(backup);
      // بکاپ خودکار همیشه با کلید دستگاهی رمزنگاری می‌شود — بدون دخالت کاربر،
      // چون این فرآیند کاملاً بی‌صدا و در پس‌زمینه اجرا می‌شود.
      const encryptedJson = await encryptBackupJson(json, null);
      const fileName = fileNameFor(backup.exportedAt);

      await Filesystem.writeFile({
        path: `${AUTO_BACKUP_DIR}/${fileName}`,
        directory: Directory.Data,
        data: encryptedJson,
        encoding: "utf8" as never,
      });

      // کپی اضافی در پوشه عمومی اندروید (بی‌صدا؛ در صورت خطا مانع بکاپ اصلی نمی‌شود)
      // و حذف نسخه‌های خارجی قدیمی‌تر از ۱۵ روز.
      await copyBackupToExternalFolder(encryptedJson, fileName);
      await pruneExternalBackupsOlderThanRetention();

      await settingsService.markAutoBackupDone(backup.exportedAt);
      await this.pruneOldAutoBackups();
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطای ناشناختهٔ بکاپ خودکار.";
      await settingsService.markAutoBackupError(message).catch(() => {
        // اگر حتی ثبت خودِ خطا هم شکست بخورد، دیگر کاری نمی‌شود کرد؛ خطای
        // اصلی هم‌چنان در ادامه پرتاب می‌شود.
      });
      throw err;
    }
  },

  /** فهرست بکاپ‌های خودکار موجود، از جدیدترین به قدیمی‌ترین. */
  async listAutoBackups(): Promise<AutoBackupInfo[]> {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const result = await Filesystem.readdir({
        path: AUTO_BACKUP_DIR,
        directory: Directory.Data,
      });

      const infos: AutoBackupInfo[] = result.files
        .map((f): AutoBackupInfo | null => {
          const name = typeof f === "string" ? f : f.name;
          const createdAt = timestampFromFileName(name);
          if (!createdAt) return null;
          const sizeBytes = typeof f === "string" ? undefined : f.size;
          return { fileName: name, createdAt, sizeBytes };
        })
        .filter((x): x is AutoBackupInfo => x !== null)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      return infos;
    } catch {
      // پوشه هنوز ساخته نشده (هنوز هیچ بکاپ خودکاری گرفته نشده است).
      return [];
    }
  },

  /** حذف بکاپ‌های خودکار اضافی، فراتر از سقف تعیین‌شده در تنظیمات کاربر. */
  async pruneOldAutoBackups(): Promise<void> {
    const settings = await settingsService.get();
    const backups = await this.listAutoBackups();
    const excess = backups.slice(settings.autoBackupMaxVersions);

    for (const b of excess) {
      try {
        await Filesystem.deleteFile({
          path: `${AUTO_BACKUP_DIR}/${b.fileName}`,
          directory: Directory.Data,
        });
      } catch {
        // در صورت خطا در حذف یک فایل، از بقیهٔ پاک‌سازی صرف‌نظر نمی‌کنیم.
      }
    }
  },

  /** بازیابی از یکی از بکاپ‌های خودکار داخلی، با نام فایل مشخص. */
  async restoreFromAutoBackup(fileName: string): Promise<void> {
    const result = await Filesystem.readFile({
      path: `${AUTO_BACKUP_DIR}/${fileName}`,
      directory: Directory.Data,
      encoding: "utf8" as never,
    });
    const text = typeof result.data === "string" ? result.data : await (result.data as Blob).text();
    // بکاپ‌های خودکار همیشه با کلید دستگاهی رمزنگاری شده‌اند (نه رمز عبور)،
    // پس نیازی به گرفتن رمز از کاربر نیست.
    const decryptedJson = await decryptBackupJson(text, null);
    const backup = JSON.parse(decryptedJson) as BackupFile;
    await restoreFromPayload(backup);
  },

  /** حذف دستی یک بکاپ خودکار مشخص. */
  async deleteAutoBackup(fileName: string): Promise<void> {
    await Filesystem.deleteFile({
      path: `${AUTO_BACKUP_DIR}/${fileName}`,
      directory: Directory.Data,
    });
  },
};
