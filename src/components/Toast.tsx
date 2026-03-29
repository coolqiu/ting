import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
    id: number;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
    return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = "info", duration = 3500) => {
        const id = nextId++;
        setToasts(prev => [...prev, { id, type, message, duration }]);
        setTimeout(() => dismiss(id), duration);
    }, [dismiss]);

    const success = useCallback((msg: string) => showToast(msg, "success"), [showToast]);
    const error = useCallback((msg: string) => showToast(msg, "error", 5000), [showToast]);
    const warning = useCallback((msg: string) => showToast(msg, "warning"), [showToast]);
    const info = useCallback((msg: string) => showToast(msg, "info"), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

// ─── Toast Container ──────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: "fixed",
            bottom: "28px",
            right: "28px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            pointerEvents: "none",
        }}>
            {toasts.map(t => (
                <ToastBubble key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

// ─── Single Toast Bubble ──────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; color: string }> = {
    success: { bg: "rgba(22, 40, 22, 0.96)", border: "rgba(76, 175, 80, 0.4)", icon: "✓", color: "#4caf50" },
    error: { bg: "rgba(40, 16, 16, 0.96)", border: "rgba(239, 83, 80, 0.4)", icon: "✕", color: "#ef5350" },
    warning: { bg: "rgba(40, 32, 8, 0.96)", border: "rgba(255, 152, 0, 0.4)", icon: "!", color: "#ff9800" },
    info: { bg: "rgba(16, 22, 40, 0.96)", border: "rgba(108, 99, 255, 0.4)", icon: "ℹ", color: "#6c63ff" },
};

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
    const s = TOAST_STYLES[toast.type];

    return (
        <div
            style={{
                pointerEvents: "all",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "13px 18px",
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: "12px",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                minWidth: "280px",
                maxWidth: "420px",
                cursor: "pointer",
                animation: "toastSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                userSelect: "none",
            }}
            onClick={() => onDismiss(toast.id)}
            title="点击关闭"
        >
            {/* Icon badge */}
            <div style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: s.color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
            }}>
                {s.icon}
            </div>

            {/* Message */}
            <span style={{ fontSize: "13px", color: "#e8eaed", lineHeight: 1.5, flex: 1 }}>
                {toast.message}
            </span>

            {/* Close hint */}
            <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>×</span>
        </div>
    );
}
