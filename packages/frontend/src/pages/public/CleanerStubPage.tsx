import { useParams } from "wouter";
import { useQuery } from "convex/react";
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
            Work With {site.brandName}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
            <span className="text-xl font-bold text-primary-700">
              {site.brandName.charAt(0)}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Join Our Team
          </h2>
          <p className="text-gray-500 mb-6">
            Interested in working with {site.brandName}? We're always looking
            for reliable cleaners in the {site.serviceArea} area.
          </p>
          <p className="text-sm text-gray-400">
            Applications coming soon. Check back later!
          </p>
        </div>
      </main>
    </div>
  );
}
