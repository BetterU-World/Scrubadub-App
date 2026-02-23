import { useState, FormEvent } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ArrowLeft } from "lucide-react";

export function CleanerStubPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const site = useQuery(
    api.queries.companySites.getBySlug,
    slug ? { slug } : "skip"
  );

  const createLead = useMutation(
    api.mutations.cleanerLeads.createCleanerLeadBySlug
  );

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [hasCar, setHasCar] = useState(false);
  const [experience, setExperience] = useState("");
  const [availability, setAvailability] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (site === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (site === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Page not found
        </h2>
        <p className="text-gray-500">
          This site doesn't exist or has been removed.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <Shell slug={slug} brandName={site.brandName}>
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
            Application received
          </h2>
          <p className="text-gray-500 mb-6">
            Thanks for your interest! We'll be in touch if there's a fit.
          </p>
          <a
            href={`/${slug}`}
            className="text-primary-600 hover:underline text-sm"
          >
            &larr; Back to {site.brandName}
          </a>
        </div>
      </Shell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createLead({
        slug,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        hasCar: hasCar || undefined,
        experience: experience.trim() || undefined,
        availability: availability.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell slug={slug} brandName={site.brandName}>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Contact info */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Your info
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              className="input-field"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Your city"
            />
          </div>
        </fieldset>

        {/* Experience & availability */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Experience & availability
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cleaning experience{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              className="input-field"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="e.g. 2 years residential cleaning"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Availability{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              className="input-field"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              placeholder="e.g. Weekdays, mornings"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasCar"
              checked={hasCar}
              onChange={(e) => setHasCar(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="hasCar" className="text-sm text-gray-700">
              I have reliable transportation
            </label>
          </div>
        </fieldset>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anything else?{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell us a bit about yourself..."
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
            Submit application
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({
  slug,
  brandName,
  children,
}: {
  slug: string;
  brandName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href={`/${slug}`}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-lg font-bold text-gray-900">
            Work With {brandName}
          </h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
