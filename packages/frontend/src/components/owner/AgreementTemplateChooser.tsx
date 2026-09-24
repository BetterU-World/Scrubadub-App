import { useTranslation } from "react-i18next";
import { AgreementContentView } from "../AgreementContentView";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AgreementReviewItems } from "./AgreementReviewItems";

type Choice = { _id: string; name: string; version?: number | null; isDefault: boolean };

export function AgreementTemplateChooser({ choices, selectedId, currentId, candidate, loading, applying, blocked, onSelect, onApply, onClose, confirmOpen, onConfirmOpenChange }: {
  choices?: Choice[];
  selectedId: string | null;
  currentId?: string | null;
  candidate?: any;
  loading: boolean;
  applying: boolean;
  blocked: boolean;
  onSelect: (id: string) => void;
  onApply: () => void;
  onClose: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const selected = choices?.find((choice) => choice._id === selectedId);
  return <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5" aria-labelledby="agreement-template-chooser-heading">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h4 id="agreement-template-chooser-heading" className="text-base font-semibold text-gray-900">{t("serviceAgreements.v2.chooseTemplate")}</h4>
        <p className="mt-1 text-sm text-gray-600">{t("serviceAgreements.v2.templatePreserves")}</p>
      </div>
      <button type="button" onClick={onClose} className="btn-secondary text-sm">{t("common.cancel")}</button>
    </div>
    {choices === undefined ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : choices.length === 0 ?
      <p className="rounded-md border border-dashed border-gray-300 bg-white p-3 text-sm text-gray-600">{t("serviceAgreements.v2.noApprovedTemplates")}</p> :
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => <label key={choice._id} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm ${selectedId === choice._id ? "border-primary-400 ring-1 ring-primary-300" : "border-gray-200"}`}>
          <input type="radio" name="agreement-template-choice" className="mt-1" checked={selectedId === choice._id} onChange={() => onSelect(choice._id)} />
          <span className="min-w-0 break-words"><span className="font-medium text-gray-900">{choice.name}</span>
            {choice.version != null && <span className="text-gray-500"> · v{choice.version}</span>}
            {choice.isDefault && <span className="block text-xs text-gray-500">{t("serviceAgreements.v2.companyDefault")}</span>}
            {choice._id === currentId && <span className="block text-xs text-primary-700">{t("serviceAgreements.v2.currentTemplate")}</span>}
          </span>
        </label>)}
      </div>}
    {selected && <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div>
        <h5 className="break-words font-semibold text-gray-900">{selected.name}{selected.version != null ? ` · v${selected.version}` : ""}</h5>
        <p className="mt-1 text-sm text-gray-600">{t("serviceAgreements.v2.templatePresentationChanges")}</p>
      </div>
      {loading ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : candidate ? <>
        <AgreementReviewItems review={candidate.authoringReview} />
        {candidate.authoringReview?.namedSectionsOutsideProse?.length > 0 && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t("serviceAgreements.v2.namedSectionsOutsideProse")}</p>}
        <details open className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer font-medium text-primary-700">{t("serviceAgreements.v2.candidatePreview")}</summary>
          <div className="mt-4 min-w-0 border-t border-gray-100 pt-4"><AgreementContentView content={candidate.canonicalPreview} audience="owner" /></div>
        </details>
        {blocked && <p className="text-sm font-medium text-amber-800">{t("serviceAgreements.v2.saveBeforeTemplate")}</p>}
        <button type="button" onClick={() => onConfirmOpenChange(true)} disabled={blocked || applying || selected._id === currentId} className="btn-primary w-full text-sm sm:w-auto">{t("serviceAgreements.v2.applyTemplate")}</button>
      </> : <p className="text-sm text-amber-800">{t("serviceAgreements.v2.candidateUnavailable")}</p>}
    </div>}
    <ConfirmDialog open={confirmOpen} onOpenChange={onConfirmOpenChange} title={t("serviceAgreements.v2.confirmTemplateTitle")}
      description={t("serviceAgreements.v2.confirmTemplateBody", { name: selected?.name ?? "" })}
      confirmLabel={t("serviceAgreements.v2.applyTemplate")} onConfirm={onApply} loading={applying} />
  </section>;
}
