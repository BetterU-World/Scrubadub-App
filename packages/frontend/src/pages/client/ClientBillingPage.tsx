import { useAction, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { AddOnSnapshotList } from "../../components/AddOnSnapshotList";
import { ClientPortalPage, ClientPortalSection, formatClientDate, formatClientMoney } from "../../components/client/ClientPortalPage";
import { useClientAuth } from "../../hooks/useClientAuth";
import { getClientStatusTranslationKey } from "../../lib/clientPresentation";

export function ClientBillingPresentation({ data, onPay }: { data: any; onPay: (id: any) => void }) {
  const { t } = useTranslation();
  return <ClientPortalSection title={t("clientHome.invoices")} empty={t("clientHome.noInvoices")} count={data.invoices.length}><div className="divide-y divide-gray-100">{data.invoices.map((invoice: any) => <article key={invoice._id} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><h3 className="break-words font-medium text-gray-900">{invoice.title || invoice.invoiceNumber}</h3>{invoice.title && <p className="text-sm text-gray-500">{invoice.invoiceNumber}</p>}<p className="mt-1 text-sm text-gray-600">{t(getClientStatusTranslationKey("invoice", invoice.status))}{invoice.dueDate && ` · ${t("clientHome.dueDate", { date: formatClientDate(invoice.dueDate, "") })}`}</p><p className="mt-2 break-words text-sm text-gray-500">{invoice.providerName}</p></div><div className="sm:text-right"><p className="font-semibold text-gray-900">{formatClientMoney(invoice.totalCents)}</p>{invoice.status === "issued" && <button type="button" onClick={() => onPay(invoice._id)} aria-label={t("clientBilling.payInvoice", { invoice: invoice.invoiceNumber })} className="btn-primary touch-target mt-3 w-full text-sm sm:w-auto">{t("invoices.payOnline")}</button>}</div>{invoice.addOnLineItems?.length > 0 && <div className="sm:col-span-2"><AddOnSnapshotList items={invoice.addOnLineItems} audience="client" showPricing /><dl className="mt-2 grid gap-1 text-sm sm:ml-auto sm:max-w-xs"><div className="flex justify-between gap-4"><dt>{t("invoices.baseSubtotal")}</dt><dd>{formatClientMoney(invoice.baseSubtotalCents)}</dd></div><div className="flex justify-between gap-4"><dt>{t("invoices.addOnSubtotal")}</dt><dd>{formatClientMoney(invoice.addOnSubtotalCents)}</dd></div><div className="flex justify-between gap-4 font-semibold"><dt>{t("invoices.total")}</dt><dd>{formatClientMoney(invoice.totalCents)}</dd></div></dl></div>}</article>)}</div></ClientPortalSection>;
}

export function ClientBillingPage() {
  const { t } = useTranslation(); const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.getClientBilling, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  const checkout = useAction((api as any).invoiceActions.createInvoiceCheckout);
  const pay = async (invoiceId: any) => { if (!clientUserId || !sessionToken) return; const result = await checkout({ clientUserId, sessionToken, invoiceId }); if (result.url) window.location.assign(result.url); };
  return <ClientPortalPage title={t("clientBilling.title")} description={t("clientBilling.description")} data={data}>{data && <ClientBillingPresentation data={data} onPay={pay} />}</ClientPortalPage>;
}
