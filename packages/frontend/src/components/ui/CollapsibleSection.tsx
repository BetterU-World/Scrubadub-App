import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

type CollapsibleSectionProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  badge,
  actions,
  icon,
  defaultExpanded = false,
  children,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section className={clsx("card overflow-hidden", className)}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {icon && <span className="mt-0.5 shrink-0 text-gray-500">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
              {title}{badge}
            </span>
            {subtitle && <span className="mt-0.5 block text-xs font-normal text-gray-500">{subtitle}</span>}
          </span>
          <ChevronDown className={clsx("mt-0.5 h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        {actions && <div className="shrink-0" onClick={(event) => event.stopPropagation()}>{actions}</div>}
      </div>
      <div className={clsx("grid transition-[grid-template-rows,opacity] duration-200", expanded ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div id={contentId} className={clsx("min-h-0 overflow-hidden", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}
