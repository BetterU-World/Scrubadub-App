import { Link } from "wouter";

export function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Contact Us
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          The Scrub App (powered by Scrubadub Solutions)
        </p>

        <p>
          Have a question, need help, or want to report an issue? We're here to
          help.
        </p>

        <h2>Email Support</h2>
        <p>
          Reach our support team at{" "}
          <a href="mailto:support@scrubadub.app">support@scrubadub.app</a>. We
          aim to respond within one business day.
        </p>

        <h2>What to Include</h2>
        <p>To help us resolve your issue quickly, please include:</p>
        <ul>
          <li>The email address associated with your account.</li>
          <li>A brief description of the issue or question.</li>
          <li>Screenshots or error messages, if applicable.</li>
          <li>
            The device and browser you are using (e.g., iPhone / Safari, PC /
            Chrome).
          </li>
        </ul>

        <h2>Common Topics</h2>
        <ul>
          <li>Account access or login issues</li>
          <li>Job scheduling or assignment questions</li>
          <li>Payment or settlement inquiries</li>
          <li>Stripe Connect onboarding help</li>
          <li>Bug reports or feature requests</li>
          <li>Data access, correction, or deletion requests</li>
        </ul>

        <div className="mt-8 not-prose">
          <Link
            href="/"
            className="text-primary-600 font-medium hover:text-primary-700"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
