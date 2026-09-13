export interface Attendance {
  id: string;
  /** پروژه‌ای که این حضور برای آن ثبت شده (یک نیرو می‌تواند در چند پروژه فعال باشد، پس این را نمی‌شود فقط از workerId استنتاج کرد). */
  projectId: string;
  workerId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAttendanceInput {
  workerId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  note?: string | null;
}
