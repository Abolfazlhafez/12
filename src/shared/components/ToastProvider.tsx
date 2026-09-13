import { Alert, Slide, SlideProps, Snackbar } from "@mui/material";
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { haptics } from "../utils/haptics";

function SlideUpTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

type ToastSeverity = "success" | "error" | "info" | "warning";

interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  showToast: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    severity: "info",
  });

  const showToast = useCallback((message: string, severity: ToastSeverity = "info") => {
    setToast({ open: true, message, severity });
    // لرزش هپتیک هم‌زمان با toast — فقط برای موفقیت/خطا (نه هر پیام info/warning
    // کم‌اهمیتی) چون این‌ها لحظاتی هستند که کاربر واقعاً منتظر تأیید لمسی است.
    if (severity === "success") haptics.success();
    else if (severity === "error") haptics.warning();
  }, []);

  const handleClose = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  // خطاها (به‌خصوص پیام‌های نسبتاً بلند مثل خطاهای رمزگشایی بکاپ) نباید
  // بعد از فقط ۴ ثانیه خودش ناپدید شود — کاربر ممکن است هنوز مشغول
  // خواندنش باشد. برای severity="error" به‌جای بستن خودکار، کاربر خودش با
  // دکمهٔ × می‌بندد؛ بقیهٔ پیام‌ها (موفقیت/اطلاع/هشدار) مثل قبل خودکار بسته می‌شوند.
  const autoHideDuration = toast.severity === "error" ? null : 4000;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={autoHideDuration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        TransitionComponent={SlideUpTransition}
        transitionDuration={{ enter: 220, exit: 160 }}
      >
        <Alert onClose={handleClose} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast باید داخل ToastProvider استفاده شود.");
  }
  return ctx;
}
