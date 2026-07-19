import { clsx } from "clsx";
import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

type TableScrollRegionProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function isHorizontallyOverflowing(
  element: Pick<HTMLElement, "clientWidth" | "scrollWidth">
) {
  return element.scrollWidth > element.clientWidth;
}

export function TableScrollRegion({
  label,
  children,
  className,
}: TableScrollRegionProps) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateOverflow = useCallback(() => {
    const region = regionRef.current;
    if (!region) return;
    setHasOverflow(isHorizontallyOverflowing(region));
  }, []);

  useLayoutEffect(() => {
    updateOverflow();

    const region = regionRef.current;
    if (!region) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflow);
      return () => window.removeEventListener("resize", updateOverflow);
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);

    return () => observer.disconnect();
  }, [children, updateOverflow]);

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={label}
      tabIndex={hasOverflow ? 0 : undefined}
      className={clsx(
        "max-w-full overflow-x-auto overscroll-x-contain rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  );
}
