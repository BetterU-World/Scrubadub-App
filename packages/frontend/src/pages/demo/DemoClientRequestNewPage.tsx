import { FormEvent, useState } from "react";
import { DemoShell } from "../../demo/DemoShell";
import { ShowcaseActionNotice } from "../../demo/ShowcaseActionNotice";
import { ClientPortalSection } from "../../components/client/ClientPortalPage";

const locations = [
  {
    value: "property-linden",
    label: "Linden House — 44 Linden Street, Asheville, NC",
  },
  {
    value: "commercial-johnson-studio",
    label: "Johnson Design Studio — 218 Market Street, Asheville, NC",
  },
];
export function DemoClientRequestNewPage({
  presentation,
  currentPath,
}: {
  presentation: boolean;
  currentPath: string;
}) {
  const [location, setLocation] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [windows, setWindows] = useState(false);
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const proceed = (e: FormEvent) => {
    e.preventDefault();
    const next = [
      !location && "Choose a service location.",
      !service && "Choose a service type.",
      !date && "Choose a preferred date.",
      !time && "Choose a preferred time window.",
    ].filter(Boolean) as string[];
    setErrors(next);
    if (!next.length) setReview(true);
  };
  return (
    <DemoShell
      presentation={presentation}
      persona="client"
      currentPath={currentPath}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-primary-700">
            BrightSide Cleaning Co.
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Request Service
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Tell BrightSide what you need and when you prefer service. The team
            confirms availability before anything is scheduled.
          </p>
        </header>
        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <p className="font-semibold">Please review your request</p>
            <ul className="mt-2 list-disc pl-5">
              {errors.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {!review ? (
          <form onSubmit={proceed} className="space-y-4" noValidate>
            <ClientPortalSection title="Provider" empty="" count={1}>
              <label className="text-sm font-medium" htmlFor="provider">
                Cleaning business
              </label>
              <select
                id="provider"
                className="input-field mt-1"
                value="brightside"
                disabled
              >
                <option value="brightside">BrightSide Cleaning Co.</option>
              </select>
            </ClientPortalSection>
            <ClientPortalSection
              title="Location"
              empty=""
              count={locations.length}
            >
              <label className="text-sm font-medium" htmlFor="location">
                Service location *
              </label>
              <select
                id="location"
                className="input-field mt-1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">Select a location</option>
                {locations.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </ClientPortalSection>
            <ClientPortalSection title="Service" empty="" count={1}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Service type *
                  <select
                    className="input-field mt-1"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                  >
                    <option value="">Select a service</option>
                    <option>Standard Clean</option>
                    <option>Deep Clean</option>
                    <option>Move In / Move Out</option>
                    <option>Vacation Rental Turnover</option>
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Preferred date *
                  <input
                    type="date"
                    min="2026-08-14"
                    className="input-field mt-1"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="text-sm font-medium">
                  Preferred time *
                  <select
                    className="input-field mt-1"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    <option value="">Select a window</option>
                    <option value="morning">Morning (8 AM–12 PM)</option>
                    <option value="afternoon">Afternoon (12–4 PM)</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </label>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                Your date and time are preferences until BrightSide confirms the
                schedule.
              </p>
            </ClientPortalSection>
            <ClientPortalSection title="Add-ons" empty="" count={2}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={windows}
                    onChange={(e) => setWindows(e.target.checked)}
                  />
                  Interior windows{" "}
                  <span className="block pl-6 text-gray-500">
                    Starting at $45
                  </span>
                </label>
                <label className="rounded-lg border p-3 text-sm">
                  <input type="checkbox" className="mr-2" />
                  Inside refrigerator{" "}
                  <span className="block pl-6 text-gray-500">$35</span>
                </label>
              </div>
            </ClientPortalSection>
            <ClientPortalSection title="Notes" empty="" count={1}>
              <label className="text-sm font-medium">
                Anything BrightSide should know?
                <textarea
                  className="input-field mt-1"
                  rows={4}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Access details, priorities, pets, or other service notes"
                />
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Do not include alarm codes or other sensitive information.
              </p>
            </ClientPortalSection>
            <div className="flex justify-end">
              <button className="btn-primary w-full sm:w-auto">
                Review request
              </button>
            </div>
          </form>
        ) : (
          <section className="space-y-5 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
            <div>
              <h2 className="text-xl font-semibold">Review your request</h2>
              <p className="mt-1 text-sm text-gray-600">
                BrightSide will confirm your requested date and time.
              </p>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Provider", "BrightSide Cleaning Co."],
                [
                  "Location",
                  locations.find((x) => x.value === location)?.label,
                ],
                ["Service", service],
                ["Preferred date", date],
                ["Preferred time", time],
                ["Add-ons", windows ? "Interior windows" : "None"],
                ["Notes", notes || "None"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Submitting a request does not confirm an appointment. The cleaning
              business reviews availability first.
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="btn-secondary"
                onClick={() => setReview(false)}
              >
                Edit request
              </button>
              <button className="btn-primary" onClick={() => setNotice(true)}>
                Submit request
              </button>
            </div>
          </section>
        )}
        <ShowcaseActionNotice
          open={notice}
          onOpenChange={setNotice}
          detail="You can explore the request form here, but Showcase does not submit requests to a real cleaning business."
        />
      </div>
    </DemoShell>
  );
}
