import { cn } from "utils/utils";

interface SwitchProps {
	id: string;
	name?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: string;
	disabled?: boolean;
	error?: string | null;
	className?: string;
}

export default function Switch({
	id,
	name,
	checked,
	onChange,
	label,
	disabled,
	error,
	className,
}: Readonly<SwitchProps>) {
	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<label htmlFor={id} className="input-label">{label}</label>
			<div className="inline-flex items-center gap-3">
				<input
					id={id}
					name={name}
					type="checkbox"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
					disabled={disabled}
					className="peer sr-only"
				/>
				<button
					type="button"
					role="switch"
					aria-checked={checked}
					aria-labelledby={label ? `${id}-label` : undefined}
					onClick={() => onChange(!checked)}
					disabled={disabled}
					className={cn(
						"relative inline-flex h-6 w-10 items-center rounded-full transition-colors",
						checked ? "bg-primary" : "bg-secondary",
						disabled && "opacity-50 cursor-not-allowed"
					)}
				>
					<span
						className={cn(
							"inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
							checked ? "translate-x-4" : "translate-x-0.5"
						)}
					/>
				</button>
			</div>
			{error && <p className="text-error">{error}</p>}
		</div>
	);
}

