import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  getServiceAgreementPresentationStatus,
  type ServiceAgreementStatusSource,
} from "@/lib/serviceAgreementStatus";

const styles = {
  not_created: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-700",
  ready: "bg-blue-100 text-blue-800",
  sent: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-green-100 text-green-800",
  signed_received: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
} as const;

export function ServiceAgreementStatusBadge({
  agreement,
  audience = "owner",
  className,
}: {
  agreement: ServiceAgreementStatusSource;
  audience?: "owner" | "client";
  className?: string;
}) {
  const { t } = useTranslation();
  const status = getServiceAgreementPresentationStatus(agreement);
  const labelKey = audience === "client" && status === "sent" ? "actionRequired" : status;

  return (
    <span className={clsx("badge", styles[status], className)}>
      {t(`serviceAgreements.presentation.${labelKey}`)}
    </span>
  );
}
