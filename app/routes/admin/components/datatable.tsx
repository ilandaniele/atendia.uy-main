import { DataTable, type DataTableColumn, type DataTableSortStatus } from "mantine-datatable";
import { Stack, Text, Button, Group } from "@mantine/core";
import { useState, useMemo, useEffect } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import { useDebouncedValue } from "@mantine/hooks";

interface DatatableProps<T> {
    columns: DataTableColumn<T>[];
    records: T[] | undefined;
    onRowClick?: (record: T) => void;
    emptyState?: {
        text: string;
        actionLabel?: string;
        onClick?: () => void;
    };
    searchPlaceholder?: string;
    initialSortStatus?: DataTableSortStatus<T>;
    idAccessor?: keyof T | ((record: T) => string | number);
}

export default function Datatable<T extends Record<string, any>>({
    columns,
    records = [],
    onRowClick,
    emptyState,
    searchPlaceholder = "Buscar...",
    initialSortStatus = { columnAccessor: "id", direction: "asc" },
    idAccessor = "_id", // Valor por defecto seguro para Convex
}: DatatableProps<T>) {
    const [page, setPage] = useState(1);
    const PAGE_SIZES = [10, 20, 50, 100];
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<T>>(initialSortStatus);
    const [query, setQuery] = useState("");
    const [debouncedQuery] = useDebouncedValue(query, 200);

    useEffect(() => {
        setPage(1);
    }, [debouncedQuery, pageSize]);

    const filteredRecords = useMemo(() => {
        let data = [...records];

        if (debouncedQuery) {
            const lowerQuery = debouncedQuery.toLowerCase();
            data = data.filter((item) =>
                Object.values(item).some((value) =>
                    String(value).toLowerCase().includes(lowerQuery)
                )
            );
        }

        if (sortStatus) {
            data.sort((a, b) => {
                const aValue = a[sortStatus.columnAccessor as keyof T];
                const bValue = b[sortStatus.columnAccessor as keyof T];

                // Manejo básico de tipos (string, number, date)
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortStatus.direction === 'asc'
                        ? aValue.localeCompare(bValue)
                        : bValue.localeCompare(aValue);
                }

                // @ts-ignore - Comparación genérica segura
                if (aValue < bValue) return sortStatus.direction === 'asc' ? -1 : 1;
                // @ts-ignore
                if (aValue > bValue) return sortStatus.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return data;
    }, [records, debouncedQuery, sortStatus]);

    const paginatedRecords = useMemo(() => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        return filteredRecords.slice(from, to);
    }, [filteredRecords, page, pageSize]);

    return (
        <Stack gap="md" className="w-full pt-2">
            <Group justify="space-between" align="center" className="w-full">
                <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                        <FaMagnifyingGlass size={14} />
                    </div>
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(e) => setQuery(e.currentTarget.value)}
                        className="block w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                </div>
            </Group>

            <DataTable
                withTableBorder
                borderRadius="md"
                withColumnBorders
                striped
                highlightOnHover
                verticalSpacing="sm"
                horizontalSpacing="md"
                records={paginatedRecords}
                totalRecords={filteredRecords.length}
                recordsPerPage={pageSize}
                page={page}
                onPageChange={setPage}
                recordsPerPageOptions={PAGE_SIZES}
                onRecordsPerPageChange={setPageSize}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                minHeight={filteredRecords.length === 0 ? 300 : undefined}
                columns={columns}
                onRowClick={onRowClick ? ({ record }) => onRowClick(record) : undefined}
                idAccessor={idAccessor}
                paginationText={({ from, to, totalRecords }) => `Mostrando ${from} - ${to} de ${totalRecords} registros`}
                recordsPerPageLabel="Filas por página"
                classNames={{
                    root: [
                        "bg-white dark:bg-slate-900",
                        "[&_th]:!px-6 [&_td]:!px-6",
                        // Filas
                        "[&_tr]:bg-white dark:[&_tr]:bg-slate-900",
                        "[&_tr:nth-child(odd)_td]:bg-slate-50 dark:[&_tr:nth-child(odd)_td]:bg-slate-800/40",
                        "[&_tr:hover_td]:!bg-primary/5 dark:[&_tr:hover_td]:!bg-primary/10",
                        // Celdas
                        "[&_td]:text-slate-800 dark:[&_td]:text-slate-200",
                        "[&_td]:border-slate-200 dark:[&_td]:border-slate-700/60",
                        // Bordes generales
                        "[&_table]:border-slate-200 dark:[&_table]:border-slate-700",
                        "border-slate-200 dark:border-slate-700",
                    ].join(" "),
                    header: [
                        "bg-slate-50 dark:bg-slate-800",
                        "[&_th]:text-slate-600 dark:[&_th]:text-slate-300",
                        "[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800",
                        "[&_th]:border-slate-200 dark:[&_th]:border-slate-700/60",
                        "[&_th]:font-semibold",
                    ].join(" "),
                    pagination: [
                        "bg-white dark:bg-slate-900",
                        "text-slate-600 dark:text-slate-300",
                        "border-slate-200 dark:border-slate-700",
                        // Botones de página
                        "[&_button]:text-slate-600 dark:[&_button]:text-slate-300",
                        "[&_button:hover]:bg-slate-100 dark:[&_button:hover]:bg-slate-800",
                        "[&_button[data-active]]:bg-primary [&_button[data-active]]:text-white",
                    ].join(" "),
                }}
                emptyState={
                    emptyState && (
                        <Stack align="center" gap="xs" py="xl">
                            <Text c="dimmed" size="sm">
                                {filteredRecords.length === 0 && query !== ""
                                    ? "No se encontraron resultados para tu búsqueda"
                                    : emptyState.text}
                            </Text>
                            {filteredRecords.length === 0 && query === "" && (
                                <div className="pointer-events-auto relative z-50">
                                    {typeof emptyState.onClick === "function" ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                emptyState.onClick!();
                                            }}
                                            className="btn-primary"
                                        >
                                            {emptyState.actionLabel || "Crear nuevo"}
                                        </button>
                                    ): null}
                                </div>
                            )}
                        </Stack>
                    )
                }
            />
        </Stack>
    );
}
