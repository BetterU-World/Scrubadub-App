import { Link } from "wouter";

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          Effective March 1, 2026
        </p>

        <p>
          These Terms of Service ("Terms") govern your use of SCRUB
          (powered by Scrubadub Solutions) ("we", "us", "our"), including all
          related websites, mobile applications, and services (collectively, the
          "Service"). By creating an account or using the Service you agree to
          these Terms.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 18 years old and capable of entering into a
          binding agreement. By using the Service you represent that you meet
          these requirements.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your login
          credentials and for all activity that occurs under your account. Notify
          us immediately at{" "}
          <a href="mailto:support@scrubadub.app">support@scrubadub.app</a> if
          you suspect unauthorized access.
        </p>

        <h2>3. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful or fraudulent purpose.</li>
          <li>
            Attempt to gain unauthorized access to any part of the Service, other
            accounts, or related systems.
          </li>
          <li>
            Scrape, crawl, or use automated means to extract data from the
            Service without our written consent.
          </li>
          <li>
            Interfere with or disrupt the integrity or performance of the
            Service.
          </li>
          <li>
            Impersonate another person or entity, or misrepresent your
            affiliation with a person or entity.
          </li>
          <li>
            Upload or transmit viruses, malware, or other harmful code.
          </li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts that violate
          these terms at our sole discretion.
        </p>

        <h2>4. Payments &amp; Fees</h2>
        <p>
          Certain features of the Service involve payments processed through
          Stripe. We do not store full credit card numbers on our servers; all
          payment information is handled directly by Stripe in accordance with
          their security standards. By initiating a payment through the Service
          you also agree to{" "}
          <a
            href="https://stripe.com/legal"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stripe's Terms of Service
          </a>
          .
        </p>
        <p>
          A platform fee may apply to certain transactions (for example, a flat
          $2.00 fee on settlement payments). Fee details are displayed before you
          confirm any payment.
        </p>

        <h2>5. Intellectual Property</h2>
        <p>
          All content, trademarks, and technology comprising the Service are
          owned by or licensed to Scrubadub Solutions. You may not copy,
          reproduce, or distribute any part of the Service without our prior
          written consent.
        </p>

        <h2>6. Limitation of Liability</h2>
        <p>
          The Service is provided on an "as is" and "as available" basis. We make
          no warranties, express or implied, regarding the Service, including but
          not limited to fitness for a particular purpose, accuracy, or
          uninterrupted availability.
        </p>
        <p>
          To the maximum extent permitted by law, Scrubadub Solutions and its
          officers, employees, and affiliates shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or
          any loss of profits or revenues, whether incurred directly or
          indirectly, arising from your use of the Service.
        </p>
        <p>
          We do not guarantee any particular business outcomes, cleaning results,
          or financial returns from using the Service.
        </p>

        <h2>7. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Scrubadub Solutions from any
          claims, damages, or expenses arising from your use of the Service or
          violation of these Terms.
        </p>

        <h2>8. Termination</h2>
        <p>
          We may suspend or terminate your access at any time for conduct that we
          believe violates these Terms or is harmful to other users or the
          Service. You may delete your account at any time by contacting support.
        </p>

        <h2>9. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. When we do, we will revise
          the "Effective" date at the top of this page. Continued use of the
          Service after changes constitutes acceptance of the revised Terms.
        </p>

        <h2>10. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of Florida, United
          States, without regard to conflict-of-law principles.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these Terms? Contact us at{" "}
          <a href="mailto:support@scrubadub.app">support@scrubadub.app</a>.
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
