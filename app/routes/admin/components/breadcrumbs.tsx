import { Link } from "react-router";
import { FaChevronRight, FaHouse } from "react-icons/fa6";
import { cn } from "utils/utils";

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
    className?: string;
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
    return (
        <nav className={cn("flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4", className)} aria-label="Breadcrumb">
            <Link 
                to="/administracion" 
                className="hover:text-primary transition-colors flex items-center gap-1"
                title="Inicio"
            >
                <FaHouse size={14} />
            </Link>

            {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                    <FaChevronRight size={10} className="text-slate-300 dark:text-slate-600 shrink-0" />
                    {item.href ? (
                        <Link 
                            to={item.href} 
                            className="hover:text-primary transition-colors whitespace-nowrap"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                            {item.label}
                        </span>
                    )}
                </div>
            ))}
        </nav>
    );
}
