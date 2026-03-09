import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <div
      className={clsx(
        "animate-spin rounded-full border-2 border-gray-200 border-t-primary-600",
        size === "sm" && "w-4 h-4",
        size === "md" && "w-8 h-8",
        size === "lg" && "w-12 h-12",
        className
      )}
    />
  );
}

export function PageLoader({ text }: { text?: string } = {}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-gray-400">{text ?? t("common.scrubbing")}</p>
    </div>
  );
}
