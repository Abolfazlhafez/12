import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// باید پیش از رندر شدن هر کامپوننتی مقداردهی اولیه شود تا هوک useTranslation
// در همان اولین رندر هم به ترجمه‌ها دسترسی داشته باشد.
import "./shared/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
