import { Link } from "wouter";

export function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Contact Us</h1>
        <p className="text-gray-500 mb-8">
          For questions about The Scrub App (powered by Scrubadub Solutions),
          please reach out to us. Contact details will be published here soon.
        </p>
        <Link href="/" className="text-primary-600 font-medium hover:text-primary-700">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
