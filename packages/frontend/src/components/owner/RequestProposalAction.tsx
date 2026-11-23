import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RequestProposalAction({ exists, creating, onClick }: {
  exists: boolean;
  creating: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return <button type="button" onClick={onClick} disabled={creating}
    className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 text-sm sm:w-auto">
    <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
    {t(exists ? "proposals.open" : creating ? "requests.creating" : "proposals.create")}
  </button>;
}
