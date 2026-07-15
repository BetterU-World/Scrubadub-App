import { useTranslation } from "react-i18next";
import { DialogShell } from "./DialogShell";
import { useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  loading,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [confirmStarted, setConfirmStarted] = useState(false);
  const pending = Boolean(loading || confirmStarted);

  const handleConfirm = async () => {
    if (pending) return;
    setConfirmStarted(true);
    try {
      await onConfirm();
    } finally {
      setConfirmStarted(false);
    }
  };
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      pending={pending}
    >
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className={
                confirmVariant === "danger" ? "btn-danger" : "btn-primary"
              }
            >
              {pending ? t("common.processing") : confirmLabel}
            </button>
          </div>
    </DialogShell>
  );
}
