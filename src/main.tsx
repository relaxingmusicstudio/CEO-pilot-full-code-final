import { createRoot } from "react-dom/client";
import ErrorBoundary from "@/components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

const formatFatalError = (error: unknown): string => {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join("\n");
  }
  return String(error);
};

const renderFatalOverlay = (label: string, error: unknown) => {
  const payload = `[fatal] ${label}\n${formatFatalError(error)}`;
  let overlay = document.getElementById("fatal-bootstrap-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "fatal-bootstrap-overlay";
    overlay.setAttribute("role", "alert");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "99999";
    overlay.style.background = "rgba(15, 15, 15, 0.92)";
    overlay.style.color = "#f8f8f2";
    overlay.style.fontFamily = "Consolas, Menlo, Monaco, \"Courier New\", monospace";
    overlay.style.padding = "32px";
    overlay.style.overflow = "auto";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.textContent = payload;
    document.body.appendChild(overlay);
  } else {
    overlay.textContent = payload;
  }
};

const logFatalError = (label: string, error: unknown) => {
  console.error(`[fatal] ${label}`, error);
  renderFatalOverlay(label, error);
};

window.addEventListener("error", (event) => {
  logFatalError("window.error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logFatalError("window.unhandledrejection", event.reason);
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  logFatalError("bootstrap", new Error("Root element #root not found"));
} else {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (error) {
    logFatalError("react_mount", error);
  }
}
