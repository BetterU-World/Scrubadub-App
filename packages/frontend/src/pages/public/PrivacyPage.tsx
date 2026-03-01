import { Link } from "wouter";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Privacy Policy
        </h1>
        <p className="text-gray-500 mb-8">
          Privacy Policy for The Scrub App (powered by Scrubadub Solutions) will
          be published here. Please check back soon.
        </p>
        <Link href="/" className="text-primary-600 font-medium hover:text-primary-700">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
