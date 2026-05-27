import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FaMagnifyingGlass, FaArrowTurnDown } from "react-icons/fa6";
import { MdClose } from "react-icons/md";
import { cn } from "utils/utils";
import { useUserNavContext } from "./user-nav-context";
import {
    PANEL_ROUTES,
    SECTION_LABELS,
    filterAccessibleRoutes,
    type PanelRoute,
    type PanelSection,
} from "./panel-routes";

type Props = {
    open: boolean;
    setOpen: (value: boolean) => void;
};

function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

function scoreRoute(route: PanelRoute, query: string): number {
    if (!query) return 0;
    const haystack = normalize(
        [route.label, route.description, ...(route.keywords ?? [])].join(" ")
    );
    const needle = normalize(query);
    if (!haystack.includes(needle.replace(/\s+/g, ""))) {
        // Try multi-token match: all tokens must appear
        const tokens = needle.split(/\s+/).filter(Boolean);
        if (!tokens.every((t) => haystack.includes(t))) return -1;
    }
    // Score: lower index = better. Label match wins.
    const labelHit = normalize(route.label).indexOf(needle);
    if (labelHit >= 0) return 100 - labelHit;
    const descHit = normalize(route.description).indexOf(needle);
    if (descHit >= 0) return 50 - Math.min(descHit, 50);
    return 10;
}

export default function CommandPalette({ open, setOpen }: Props) {
    const navigate = useNavigate();
    const { userRole, features } = useUserNavContext();

    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const accessibleRoutes = useMemo(
        () => filterAccessibleRoutes(PANEL_ROUTES, userRole, features),
        [userRole, features]
    );

    // Filtrado + ordenamiento
    const results = useMemo(() => {
        if (!query.trim()) return accessibleRoutes;
        return accessibleRoutes
            .map((r) => ({ route: r, score: scoreRoute(r, query) }))
            .filter((x) => x.score >= 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.route);
    }, [accessibleRoutes, query]);

    // Agrupar por sección (sólo cuando no hay query)
    const grouped = useMemo(() => {
        if (query.trim()) return null;
        const map: Record<PanelSection, PanelRoute[]> = {
            main: [],
            billing: [],
            account: [],
        };
        for (const r of results) map[r.section].push(r);
        return (["main", "billing", "account"] as PanelSection[])
            .map((section) => ({ section, routes: map[section] }))
            .filter((g) => g.routes.length > 0);
    }, [results, query]);

    // Atajo global ⌘K / Ctrl+K
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const isModK =
                (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
            if (isModK) {
                e.preventDefault();
                setOpen(!open);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, setOpen]);

    // Reset al abrir
    useEffect(() => {
        if (open) {
            setQuery("");
            setActiveIndex(0);
            // pequeño delay para que el input ya esté montado
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Mantener índice activo dentro de rango
    useEffect(() => {
        if (activeIndex >= results.length) {
            setActiveIndex(Math.max(0, results.length - 1));
        }
    }, [results.length, activeIndex]);

    // Scroll del item activo a la vista
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector<HTMLElement>(
            `[data-index="${activeIndex}"]`
        );
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    if (!open) return null;

    const handleSelect = (route: PanelRoute) => {
        setOpen(false);
        navigate(route.path);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) =>
                results.length ? (i - 1 + results.length) % results.length : 0
            );
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            const route = results[activeIndex];
            if (route) handleSelect(route);
        }
    };

    let flatIndex = -1;

    const renderRow = (route: PanelRoute) => {
        flatIndex += 1;
        const idx = flatIndex;
        const isActive = idx === activeIndex;
        return (
            <button
                key={route.path}
                type="button"
                data-index={idx}
                data-selected={isActive ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(route)}
                className={cn(
                    "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    isActive
                        ? "bg-primary/10 text-primary"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
            >
                <span
                    className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-slate-400 dark:text-slate-500"
                    )}
                >
                    {route.icon}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-3">
                        <span className="font-medium truncate">{route.label}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0 hidden sm:inline">
                            {route.path}
                        </span>
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                        {route.description}
                    </span>
                </span>
                {isActive && (
                    <FaArrowTurnDown className="h-3.5 w-3.5 shrink-0 text-primary -rotate-90" />
                )}
            </button>
        );
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[10vh] sm:pt-[15vh]"
            role="dialog"
            aria-modal="true"
            aria-label="Buscar páginas"
            onKeyDown={onKeyDown}
        >
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
                onClick={() => setOpen(false)}
                aria-hidden="true"
            />

            <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-150">
                {/* Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <FaMagnifyingGlass className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        placeholder="Buscar páginas, configuraciones, secciones…"
                        className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        aria-label="Buscar"
                    />
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                        aria-label="Cerrar"
                    >
                        <MdClose className="h-4 w-4" />
                    </button>
                </div>

                {/* Resultados */}
                <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto p-2"
                >
                    {results.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                No encontramos páginas para{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    «{query}»
                                </span>
                                .
                            </p>
                        </div>
                    ) : grouped ? (
                        <div className="flex flex-col gap-3">
                            {grouped.map(({ section, routes }) => (
                                <div key={section}>
                                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        {SECTION_LABELS[section]}
                                    </p>
                                    <div className="flex flex-col gap-0.5">
                                        {routes.map((r) => renderRow(r))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            {results.map((r) => renderRow(r))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="hidden sm:flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[10px]">↑</kbd>
                            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[10px]">↓</kbd>
                            navegar
                        </span>
                        <span className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[10px]">↵</kbd>
                            abrir
                        </span>
                        <span className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[10px]">esc</kbd>
                            cerrar
                        </span>
                    </div>
                    <span className="text-slate-400">
                        {results.length} {results.length === 1 ? "resultado" : "resultados"}
                    </span>
                </div>
            </div>
        </div>
    );
}
