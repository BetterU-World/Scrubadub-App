import { useState, FormEvent } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const TIME_WINDOWS = [
  { value: "", label: "No preference" },
  { value: "morning", label: "Morning (8am–12pm)" },
  { value: "afternoon", label: "Afternoon (12pm–5pm)" },
  { value: "evening", label: "Evening (5pm–8pm)" },
];

export function PublicRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const company = useQuery(
    api.queries.clientRequests.getCompanyByRequestToken,
    token ? { token } : "skip"
  );

  const createRequest = useMutation(
    api.mutations.clientRequests.createClientRequestByToken
  );

  // Read service pre-selection from query param
  const [requestedService] = useState(() => {
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
  const [notes, setNotes] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const svc = sp.get("service");
    return svc ? `Interested in: ${svc}` : "";
  });
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
            Invalid request link
          </h2>
          <p className="text-gray-500">
            This link is no longer valid. Please contact the company directly.
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
        clientNotes: specialInstructions.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
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

        {/* Pre-selected service */}
        {requestedService && (
          <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800">
            Requested service: <strong>{requestedService}</strong>
          </div>
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

/** Minimal page shell — no sidebar, no auth chrome. */
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
