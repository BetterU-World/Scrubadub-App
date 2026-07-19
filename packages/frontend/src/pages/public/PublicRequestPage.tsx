import { useState, FormEvent } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { useTranslation } from "react-i18next";
import { formatPublicAddOnPrice, parsePublicAddOnSelections } from "@/lib/publicAddOnPresentation";

type RequestAddOn = {
  addOnId: string; name: string; description: string | null;
  pricingMethod: "flat" | "starting_at" | "per_unit";
  priceCents: number; unitLabel: string | null; selectionVersion: string;
};

const TIME_WINDOWS = [
  { value: "", label: "No preference" },
  { value: "morning", label: "Morning (8am\u201312pm)" },
  { value: "afternoon", label: "Afternoon (12pm\u20135pm)" },
  { value: "evening", label: "Evening (5pm\u20138pm)" },
];

const SERVICE_OPTIONS = [
  { value: "", label: "Select a service..." },
  { value: "Standard Clean", label: "Standard Clean" },
  { value: "Deep Clean", label: "Deep Clean" },
  { value: "Turnover", label: "Turnover" },
  { value: "Move In/Out", label: "Move In / Move Out" },
  { value: "Maintenance", label: "Maintenance" },
  { value: "Other", label: "Other" },
];

export function PublicRequestPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const company = useQuery(
    api.queries.clientRequests.getCompanyByRequestToken,
    token ? { token } : "skip"
  );
  const availableAddOns = useQuery(
    (api as any).queries.companyAddOns.listPublic,
    token ? { publicRequestToken: token } : "skip"
  ) as RequestAddOn[] | undefined;

  const createRequest = useMutation(
    api.mutations.clientRequests.createClientRequestByToken
  );

  // Read service pre-selection from query param
  const [serviceFromParam] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("service") ?? "";
  });

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [selectedService, setSelectedService] = useState(() => {
    if (!serviceFromParam) return "";
    // Try to match to a known service option
    const match = SERVICE_OPTIONS.find(
      (o) => o.value.toLowerCase() === serviceFromParam.toLowerCase()
    );
    return match ? match.value : "Other";
  });
  const [notes, setNotes] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const svc = sp.get("service");
    // If param doesn't match a known option, prefill notes with it
    if (svc) {
      const match = SERVICE_OPTIONS.find(
        (o) => o.value.toLowerCase() === svc.toLowerCase()
      );
      if (!match) return `Interested in: ${svc}`;
    }
    return "";
  });
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, { selectionVersion: string; quantity?: number }>>(() =>
    Object.fromEntries(parsePublicAddOnSelections(window.location.search).slice(0, 20).map((selection) => [selection.companyAddOnId, { selectionVersion: selection.selectionVersion, quantity: selection.quantity }]))
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const addOnById = new Map((availableAddOns ?? []).map((addOn) => [addOn.addOnId, addOn]));
  const staleSelectionIds = Object.keys(selectedAddOns).filter((id) => {
    const current = addOnById.get(id);
    return !current || current.selectionVersion !== selectedAddOns[id].selectionVersion;
  });
  const priceLabel = (addOn: RequestAddOn) => formatPublicAddOnPrice(addOn, i18n.resolvedLanguage ?? i18n.language, {
    startingAt: (price) => t("publicSite.addOns.startingAt", { price }),
    perUnit: (price, unit) => t("publicSite.addOns.perUnit", { price, unit }),
  });

  // Loading state
  if (company === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </Shell>
    );
  }

  // Invalid token
  if (company === null) {
    return (
      <Shell>
        <div className="card text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            This link has expired
          </h2>
          <p className="text-gray-500">
            Ask your provider to resend a new link.
          </p>
        </div>
      </Shell>
    );
  }

  // Success state
  if (submitted) {
    return (
      <Shell companyName={company.companyName}>
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
            <svg
              className="h-6 w-6 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Request received
          </h2>
          <p className="text-gray-500">
            We'll contact you soon to confirm the details.
          </p>
        </div>
      </Shell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (staleSelectionIds.length) throw new Error(t("publicSite.addOns.reviewChanged"));
      // Resolve the final service value
      const finalService =
        selectedService === "Other"
          ? serviceFromParam || undefined
          : selectedService || undefined;

      await createRequest({
        token,
        requesterName: name.trim(),
        requesterEmail: email.trim().toLowerCase(),
        requesterPhone: phone.trim() || undefined,
        propertySnapshot: {
          address: address.trim(),
          name: propertyName.trim() || undefined,
        },
        requestedDate: requestedDate || undefined,
        timeWindow: timeWindow || undefined,
        notes: notes.trim() || undefined,
        requestedService: finalService,
        requestedAddOns: Object.entries(selectedAddOns).map(([companyAddOnId, selection]) => ({ companyAddOnId, ...selection })) as any,
        clientNotes: specialInstructions.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(toFriendlyMessage(err, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell companyName={company.companyName}>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Contact info */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Your contact info
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="tel"
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
        </fieldset>

        {/* Service selection */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">Service type</legend>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What do you need?</label>
            <select className="input-field" value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
              {SERVICE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          {serviceFromParam && selectedService === "Other" && (
            <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800">Requested: <strong>{serviceFromParam}</strong></div>
          )}
        </fieldset>

        {(availableAddOns?.length ?? 0) > 0 && (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900">{t("publicSite.addOns.title")}</legend>
            <p className="text-sm text-gray-500">{t("publicSite.addOns.requestHelp")}</p>
            <div className="space-y-3">
              {availableAddOns!.map((addOn) => {
                const selection = selectedAddOns[addOn.addOnId];
                const changed = selection && selection.selectionVersion !== addOn.selectionVersion;
                return (
                  <div key={addOn.addOnId} className={`rounded-lg border p-4 ${selection ? "border-primary-300 bg-primary-50/40" : "border-gray-200"}`}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={Boolean(selection)}
                        onChange={(event) => setSelectedAddOns((current) => {
                          if (!event.target.checked) { const next = { ...current }; delete next[addOn.addOnId]; return next; }
                          if (Object.keys(current).length >= 20) return current;
                          return { ...current, [addOn.addOnId]: { selectionVersion: addOn.selectionVersion, quantity: addOn.pricingMethod === "per_unit" ? 1 : undefined } };
                        })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900">{addOn.name}</span>
                        <span className="block text-sm font-medium text-primary-600">{priceLabel(addOn)}</span>
                      </span>
                    </label>
                    {selection && addOn.pricingMethod === "per_unit" && (
                      <label className="mt-3 block text-sm text-gray-700">
                        {t("publicSite.addOns.quantity")}
                        <input type="number" min={1} max={999} step={1} className="input-field mt-1" value={selection.quantity ?? 1}
                          onChange={(event) => setSelectedAddOns((current) => ({ ...current, [addOn.addOnId]: { ...current[addOn.addOnId], quantity: Number(event.target.value) } }))} />
                      </label>
                    )}
                    {changed && (
                      <button type="button" className="mt-3 text-sm font-medium text-amber-700 underline" onClick={() => setSelectedAddOns((current) => ({ ...current, [addOn.addOnId]: { selectionVersion: addOn.selectionVersion, quantity: addOn.pricingMethod === "per_unit" ? Math.min(999, Math.max(1, current[addOn.addOnId]?.quantity ?? 1)) : undefined } }))}>
                        {t("publicSite.addOns.reviewUpdatedPrice")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {staleSelectionIds.some((id) => !addOnById.has(id)) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t("publicSite.addOns.unavailableSelection")}
                <button type="button" className="ml-2 font-medium underline" onClick={() => setSelectedAddOns((current) => Object.fromEntries(Object.entries(current).filter(([id]) => addOnById.has(id))))}>{t("publicSite.addOns.removeUnavailable")}</button>
              </div>
            )}
          </fieldset>
        )}

        {/* Property info */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Property details
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              className="input-field"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              placeholder="123 Main St, City, State"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property name{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              className="input-field"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder='e.g. "Lake House", "Unit 4B"'
            />
          </div>
        </fieldset>

        {/* Scheduling */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Preferred schedule
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              className="input-field"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              required
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time window{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <select
              className="input-field"
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
            >
              {TIME_WINDOWS.map((tw) => (
                <option key={tw.value} value={tw.value}>
                  {tw.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else we should know?"
          />
        </div>

        {/* Special instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Special instructions{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            className="input-field"
            rows={2}
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="e.g. Gate code is 1234, please use side entrance..."
            maxLength={2000}
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && <LoadingSpinner size="sm" />}
            Submit request
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Minimal page shell \u2014 no sidebar, no auth chrome. */
function Shell({
  companyName,
  children,
}: {
  companyName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">
            Request a Clean
            {companyName && (
              <span className="font-normal text-gray-500">
                {" "}
                &mdash; {companyName}
              </span>
            )}
          </h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
