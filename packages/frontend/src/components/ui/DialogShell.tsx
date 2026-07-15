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
  children: ReactNode;
  pending?: boolean;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
  className?: string;
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
            "fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-xl focus:outline-none",
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
          <div className="mb-4 pr-8">
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
                className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
