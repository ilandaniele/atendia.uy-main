import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FaBell, FaXmark } from "react-icons/fa6";
import { cn } from "utils/utils";

export type AlertSeverity = "info" | "warning" | "danger";

export type SystemAlert = {
    id: string;
    severity: AlertSeverity;
    icon: ReactNode;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
        disabled?: boolean;
        loadingLabel?: string;
        loading?: boolean;
    };
    onDismiss?: () => void;
};

const SEVERITY_STYLES: Record<
    AlertSeverity,
    { iconWrap: string; accent: string; ring: string }
> = {
    info: {
        iconWrap: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
        accent: "text-blue-600 dark:text-blue-400",
        ring: "ring-blue-200 dark:ring-blue-900/40",
    },
    warning: {
        iconWrap: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
        accent: "text-amber-700 dark:text-amber-400",
        ring: "ring-amber-200 dark:ring-amber-900/40",
    },
    danger: {
        iconWrap: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
        accent: "text-red-600 dark:text-red-400",
        ring: "ring-red-200 dark:ring-red-900/40",
    },
};

type Props = {
    alerts: SystemAlert[];
};

export default function NotificationsPanel({ alerts }: Props) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Cerrar al hacer click fuera o presionar Escape
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                panelRef.current?.contains(target) ||
                buttonRef.current?.contains(target)
            ) {
                return;
            }
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const count = alerts.length;
    const hasAlerts = count > 0;
    const hasDanger = alerts.some((a) => a.severity === "danger");

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    open
                        ? "bg-primary/10 text-primary"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
                aria-label={
                    hasAlerts
                        ? `Notificaciones (${count} sin leer)`
                        : "Notificaciones"
                }
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <FaBell className="h-4 w-4" />
                {hasAlerts && (
                    <span
                        className={cn(
                            "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none ring-2 ring-white dark:ring-slate-900",
                            hasDanger ? "bg-red-500" : "bg-amber-500"
                        )}
                    >
                        {count > 9 ? "9+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Notificaciones"
                    className={cn(
                        // En móvil flota debajo del navbar y ocupa el ancho disponible
                        "fixed left-2 right-2 top-[4.5rem] w-auto max-h-[calc(100vh-5.5rem)]",
                        // En tablet+ se ancla a la campana
                        "sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-[70vh]",
                        "bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col",
                        "origin-top-right animate-in fade-in zoom-in-95 duration-150 z-50"
                    )}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                Notificaciones
                            </h3>
                            {hasAlerts && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                                    {count}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                            aria-label="Cerrar"
                        >
                            <FaXmark className="h-4 w-4" />
                        </button>
                    </div>

                    {hasAlerts ? (
                        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                            {alerts.map((alert) => {
                                const styles = SEVERITY_STYLES[alert.severity];
                                return (
                                    <li
                                        key={alert.id}
                                        className="p-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={cn(
                                                    "shrink-0 h-9 w-9 rounded-full flex items-center justify-center ring-4",
                                                    styles.iconWrap,
                                                    styles.ring
                                                )}
                                                aria-hidden="true"
                                            >
                                                {alert.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                                                        {alert.title}
                                                    </p>
                                                    {alert.onDismiss && (
                                                        <button
                                                            type="button"
                                                            onClick={alert.onDismiss}
                                                            className="shrink-0 -mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                                                            aria-label="Descartar"
                                                            title="Descartar"
                                                        >
                                                            <FaXmark className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                    {alert.description}
                                                </p>
                                                {alert.action && (
                                                    <button
                                                        type="button"
                                                        onClick={alert.action.onClick}
                                                        disabled={
                                                            alert.action.disabled ||
                                                            alert.action.loading
                                                        }
                                                        className={cn(
                                                            "mt-3 inline-flex items-center text-xs font-semibold underline-offset-4 hover:underline disabled:opacity-60 disabled:cursor-not-allowed transition-opacity",
                                                            styles.accent
                                                        )}
                                                    >
                                                        {alert.action.loading
                                                            ? (alert.action.loadingLabel ?? "Procesando…")
                                                            : alert.action.label}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
                            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <FaBell className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Estás al día
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[14rem]">
                                No tenés notificaciones nuevas en este momento.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
