import { FaPlus } from "react-icons/fa6";
import { Link } from "react-router";

interface PageHeaderProps {
    title: string;
    button?: {
        href?: string;
        text: string;
        onClick?: () => void;
    },
}

export default function PageHeader({ title, button }: PageHeaderProps) {
    return (
        <div className="flex flex-row justify-between mb-4 items-center">
            <h1 className="text-3xl font-bold dark:text-slate-100">{title}</h1>
            {button && (
                button.href ? (
                    <Link to={button.href} className="btn-primary no-underline">
                        <FaPlus className="w-4 h-4 mr-2" />
                        {button.text}
                    </Link>
                ) : (
                    <button onClick={button.onClick} className="btn-primary no-underline">
                        <FaPlus className="w-4 h-4 mr-2" />
                        {button.text}
                    </button>
                )
            )}
        </div>
    )
}