import { useState, FormEvent } from "react";
import { Link } from "wouter";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";

const SUPPORT_EMAIL = "scrubadubsolutionsllc@gmail.com";

export function ContactPage() {
  const submitContactForm = useAction(api.actions.contactForm.submitContactForm);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      await submitContactForm({ name, email, subject, message });
      setStatus("sent");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Contact Us
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          SCRUB (powered by Scrubadub Solutions)
        </p>

        <p>
          Have a question, need help, or want to report an issue? Fill out the
          form below and we'll get back to you within one business day.
        </p>

        {status === "sent" ? (
          <div className="not-prose bg-green-50 border border-green-200 rounded-lg p-6 my-6">
            <p className="text-green-800 font-medium">Message sent!</p>
            <p className="text-green-700 text-sm mt-1">
              We'll respond to your inquiry as soon as possible.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-3 text-sm text-green-700 underline hover:text-green-900"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="not-prose space-y-4 my-6">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="contact-subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                id="contact-subject"
                type="text"
                required
                maxLength={300}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="What can we help with?"
              />
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                id="contact-message"
                required
                maxLength={5000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="Describe your issue or question..."
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>
          </form>
        )}

        <h2>Common Topics</h2>
        <ul>
          <li>Account access or login issues</li>
          <li>Job scheduling or assignment questions</li>
          <li>Payment or settlement inquiries</li>
          <li>Stripe Connect onboarding help</li>
          <li>Bug reports or feature requests</li>
          <li>Data access, correction, or deletion requests</li>
        </ul>

        <h2>Email Us Directly</h2>
        <p>
          You can also reach us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>

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
