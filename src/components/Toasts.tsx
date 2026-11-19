import { Check, Info, TriangleAlert } from "lucide-react";
import type { Toast } from "../types";

interface ToastsProps {
  toasts: Toast[];
}

export function Toasts({ toasts }: ToastsProps) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          <span className="toast-icon">
            {toast.tone === "success" ? (
              <Check size={13} />
            ) : toast.tone === "error" ? (
              <TriangleAlert size={13} />
            ) : (
              <Info size={13} />
            )}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
