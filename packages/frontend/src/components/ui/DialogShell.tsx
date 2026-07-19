import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type DialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  pending?: boolean;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
  className?: string;
  footer?: ReactNode;
};

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  pending = false,
  closeOnOutsideClick = true,
  showCloseButton = true,
  className,
  footer,
}: DialogShellProps) {
  const { t } = useTranslation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-busy={pending || undefined}
          className={clsx(
            "fixed left-1/2 top-[calc(50%+(var(--safe-area-top)-var(--safe-area-bottom))/2)] z-50 flex max-h-[calc(100dvh-2rem-var(--safe-area-top)-var(--safe-area-bottom))] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl focus:outline-none",
            className
          )}
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (pending || !closeOnOutsideClick) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (pending || !closeOnOutsideClick) event.preventDefault();
          }}
        >
          <div className="shrink-0 px-4 pb-4 pt-4 pr-14 sm:px-6 sm:pb-4 sm:pt-6 sm:pr-16">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-gray-600">
                {description}
              </Dialog.Description>
            )}
          </div>
          {showCloseButton && (
            <Dialog.Close asChild disabled={pending}>
              <button
                type="button"
                aria-label={t("common.closeDialog")}
                disabled={pending}
                className="touch-target absolute right-2 top-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:right-3 sm:top-3"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
            {children}
          </div>
          {footer && (
            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-200 bg-white px-4 py-4 [&>*]:w-full sm:flex-row sm:justify-end sm:px-6 sm:[&>*]:w-auto">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
