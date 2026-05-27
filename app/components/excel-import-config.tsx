import {
    FaSpinner, FaCircleCheck, FaTriangleExclamation,
    FaChevronDown, FaChevronUp, FaSliders,
} from "react-icons/fa6";
import { cn, colIndexToLetter, colLetterToIndex } from "utils/utils";

// ─── Tipos compartidos ─────────────────────────────────────────────────────────

export type SheetCfg = {
    headerRowInput: string;
    startColInput: string;
    expanded: boolean;
};

export type ParsedSheet = {
    name: string;
    headers: string[];
    rows: unknown[][];
    cfgValid: boolean;
};

export type DuplicateBehavior = "add" | "update";

// Una fila se considera vacía si todas sus celdas son null/undefined o, al
// convertir a string, sólo contienen whitespace. Excel suele dejar miles de
// filas en blanco con estilos aplicados — las descartamos para que los conteos
// y la vista previa reflejen sólo filas con datos reales.
export function isEmptyRow(row: unknown): boolean {
    if (!Array.isArray(row)) return true;
    return row.every(cell => cell == null || String(cell).trim() === "");
}

const INPUT = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder-slate-400 text-sm";

// ─── Excel Import Config ───────────────────────────────────────────────────────

interface ExcelImportConfigProps {
    rawSheets: { name: string; rows: unknown[][] }[];
    parsedSheets: ParsedSheet[];
    activeParsedSheets: ParsedSheet[];
    selectedSheets: string[];
    sheetConfigs: Record<string, SheetCfg>;
    customizing: boolean;
    customCols: Record<string, string[]>;
    keyColumn: string | null;
    duplicateBehavior: DuplicateBehavior;
    unionColumns: string[];
    totalRows: number;
    multiSheet: boolean;
    submitting: boolean;
    getEffectiveCols: (p: ParsedSheet) => string[];
    onToggleSheet: (name: string) => void;
    onUpdateSheetCfg: (name: string, patch: Partial<SheetCfg>) => void;
    onToggleCustomizing: () => void;
    onResetCustomCols: () => void;
    onToggleCustomCol: (sheetName: string, headers: string[], col: string) => void;
    onChangeKeyColumn: (v: string | null) => void;
    onChangeDuplicateBehavior: (v: DuplicateBehavior) => void;
    onReset: () => void;
    onImport: () => void;
}

export function ExcelImportConfig(props: ExcelImportConfigProps) {
    const {
        rawSheets, activeParsedSheets, selectedSheets, sheetConfigs,
        customizing, customCols, keyColumn, duplicateBehavior, unionColumns,
        totalRows, multiSheet, submitting,
        getEffectiveCols, onToggleSheet, onUpdateSheetCfg, onToggleCustomizing,
        onResetCustomCols, onToggleCustomCol, onChangeKeyColumn,
        onChangeDuplicateBehavior, onReset, onImport,
    } = props;

    const previewSheet = activeParsedSheets.find(p => p.cfgValid && p.rows.length > 0) ?? null;
    const previewCols = previewSheet ? getEffectiveCols(previewSheet) : [];
    const invalidSelected = activeParsedSheets.filter(p => !p.cfgValid);
    const canImport = !submitting && activeParsedSheets.some(p => p.cfgValid && getEffectiveCols(p).length > 0);

    return (
        <div className="space-y-5">
            {/* Resumen */}
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <FaCircleCheck className="w-4 h-4" />
                Archivo cargado — {rawSheets.length} hoja{rawSheets.length !== 1 ? "s" : ""}, {totalRows} fila{totalRows !== 1 ? "s" : ""} en total
            </div>

            {/* Selección de hojas (sólo si hay más de una) */}
            {rawSheets.length > 1 && (
                <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Hojas a importar</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Elegí una o varias. {multiSheet && "Se incluye el nombre de la hoja en cada fragmento."}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {rawSheets.map(s => {
                            const selected = selectedSheets.includes(s.name);
                            return (
                                <button
                                    key={s.name}
                                    type="button"
                                    onClick={() => onToggleSheet(s.name)}
                                    disabled={submitting}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all",
                                        selected
                                            ? "bg-primary/10 border-primary text-primary font-medium"
                                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300",
                                        submitting && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {selected && <FaCircleCheck className="w-3 h-3" />}
                                    {s.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Configuración por hoja (accordion) */}
            {activeParsedSheets.length > 0 && (
                <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Inicio de la tabla</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Por defecto la tabla comienza en la fila 1, columna A. Expandí una hoja si necesitás cambiarlo.
                        </p>
                    </div>
                    <div className="space-y-1.5 pt-1">
                        {activeParsedSheets.map(p => (
                            <SheetAccordion
                                key={p.name}
                                parsed={p}
                                cfg={sheetConfigs[p.name]}
                                submitting={submitting}
                                onUpdateCfg={patch => onUpdateSheetCfg(p.name, patch)}
                                onToggleExpand={() => onUpdateSheetCfg(p.name, { expanded: !sheetConfigs[p.name]?.expanded })}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Aviso si alguna hoja seleccionada no tiene filas válidas */}
            {invalidSelected.length > 0 && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                    <FaTriangleExclamation className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        {invalidSelected.length === 1
                            ? <>La hoja <strong>{invalidSelected[0].name}</strong> no tiene filas con la configuración actual.</>
                            : <>{invalidSelected.length} hojas no tienen filas con la configuración actual: <strong>{invalidSelected.map(p => p.name).join(", ")}</strong>.</>}
                    </span>
                </div>
            )}

            {/* Columna identificadora (dropdown) + duplicados */}
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Columna identificadora <span className="text-slate-400 font-normal">(opcional)</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Si elegís una columna como ID, podés controlar qué pasa con los registros duplicados.
                    </p>
                </div>
                <select
                    value={keyColumn ?? ""}
                    onChange={e => onChangeKeyColumn(e.target.value === "" ? null : e.target.value)}
                    disabled={submitting || unionColumns.length === 0}
                    className={cn(INPUT, "py-2 cursor-pointer")}
                >
                    <option value="">Ninguna</option>
                    {unionColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
                {keyColumn !== null && (
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => onChangeDuplicateBehavior("update")}
                            disabled={submitting}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-xs border font-medium transition-all",
                                duplicateBehavior === "update"
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                            )}
                        >
                            Actualizar existentes
                        </button>
                        <button
                            type="button"
                            onClick={() => onChangeDuplicateBehavior("add")}
                            disabled={submitting}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-xs border font-medium transition-all",
                                duplicateBehavior === "add"
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                            )}
                        >
                            Solo agregar nuevas
                        </button>
                    </div>
                )}
            </div>

            {/* Columnas a importar */}
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Columnas a importar</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {customizing
                                ? "Marcá las columnas que se deben incluir en cada hoja."
                                : `Se importarán todas las columnas (${unionColumns.length} en total).`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (customizing) onResetCustomCols();
                            onToggleCustomizing();
                        }}
                        disabled={submitting}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                        <FaSliders className="w-3 h-3" />
                        {customizing ? "Importar todas" : "Personalizar importación"}
                    </button>
                </div>

                {customizing && (
                    <div className="space-y-3 pt-1">
                        {activeParsedSheets.filter(p => p.cfgValid).map(p => {
                            const explicit = customCols[p.name];
                            const isSelected = (col: string) => explicit === undefined ? true : explicit.includes(col);
                            return (
                                <div key={p.name} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                                    {multiSheet && (
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{p.name}</p>
                                    )}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {p.headers.map(header => {
                                            const selected = isSelected(header);
                                            return (
                                                <button
                                                    key={header}
                                                    type="button"
                                                    onClick={() => onToggleCustomCol(p.name, p.headers, header)}
                                                    disabled={submitting}
                                                    className={cn(
                                                        "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border text-left transition-all",
                                                        selected
                                                            ? "bg-primary/10 border-primary text-primary font-medium"
                                                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300",
                                                        submitting && "opacity-50 cursor-not-allowed"
                                                    )}
                                                >
                                                    <span className="truncate">{header}</span>
                                                    {selected && <FaCircleCheck className="w-3 h-3 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Vista previa */}
            {previewSheet && previewCols.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">
                        Vista previa — primera fila de {previewSheet.name}
                    </p>
                    <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-xs overflow-x-auto font-mono leading-relaxed">
                        {[
                            multiSheet ? `Hoja: ${previewSheet.name}` : null,
                            ...previewCols.map(col => {
                                const idx = previewSheet.headers.indexOf(col);
                                const val = idx >= 0 ? (previewSheet.rows[0] as unknown[])[idx] : null;
                                return `${col}: ${val ?? "—"}`;
                            }),
                        ].filter(Boolean).join("\n")}
                    </pre>
                </div>
            )}

            {/* Acciones */}
            <div className="flex justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                    type="button"
                    onClick={onReset}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                    Cambiar archivo
                </button>
                <button
                    type="button"
                    onClick={onImport}
                    disabled={!canImport}
                    className={cn("btn-primary min-w-36", !canImport && "opacity-70 cursor-not-allowed")}
                >
                    {submitting
                        ? <span className="flex items-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />Importando...</span>
                        : "Iniciar importación"}
                </button>
            </div>
        </div>
    );
}

// ─── Sheet Accordion ───────────────────────────────────────────────────────────

function SheetAccordion({
    parsed, cfg, submitting, onUpdateCfg, onToggleExpand,
}: {
    parsed: ParsedSheet;
    cfg: SheetCfg | undefined;
    submitting: boolean;
    onUpdateCfg: (patch: Partial<SheetCfg>) => void;
    onToggleExpand: () => void;
}) {
    const headerRow = cfg?.headerRowInput ?? "1";
    const startCol = cfg?.startColInput ?? "A";
    const startColIdx = colLetterToIndex(startCol) ?? 0;
    const expanded = cfg?.expanded ?? false;

    return (
        <div className={cn(
            "rounded-xl border bg-white dark:bg-slate-900 transition-colors",
            parsed.cfgValid
                ? "border-slate-200 dark:border-slate-700"
                : "border-amber-300 dark:border-amber-700"
        )}>
            <button
                type="button"
                onClick={onToggleExpand}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
            >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{parsed.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">
                        Fila {headerRow || "?"} · Col {startCol || "?"} · {parsed.rows.length} fila{parsed.rows.length !== 1 ? "s" : ""}
                    </span>
                    {expanded ? <FaChevronUp className="w-3 h-3 text-slate-400" /> : <FaChevronDown className="w-3 h-3 text-slate-400" />}
                </span>
            </button>
            {expanded && (
                <div className="grid grid-cols-2 gap-3 p-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Fila de encabezados
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={headerRow}
                            onChange={e => onUpdateCfg({ headerRowInput: e.target.value })}
                            disabled={submitting}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Primera columna
                        </label>
                        <input
                            type="text"
                            inputMode="text"
                            value={startCol}
                            onChange={e => onUpdateCfg({ startColInput: e.target.value.toUpperCase() })}
                            onBlur={() => {
                                if (colLetterToIndex(startCol) === null) {
                                    onUpdateCfg({ startColInput: colIndexToLetter(startColIdx) });
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    onUpdateCfg({ startColInput: colIndexToLetter(startColIdx + 1) });
                                } else if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    onUpdateCfg({ startColInput: colIndexToLetter(Math.max(0, startColIdx - 1)) });
                                }
                            }}
                            disabled={submitting}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50 uppercase"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">A, B, C… (↑/↓)</p>
                    </div>
                </div>
            )}
        </div>
    );
}
