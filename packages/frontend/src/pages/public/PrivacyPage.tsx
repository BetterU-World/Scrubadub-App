import { Link } from "wouter";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="max-w-2xl mx-auto prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          Effective March 1, 2026
        </p>

        <p>
          This Privacy Policy describes how SCRUB (powered by Scrubadub
          Solutions) ("we", "us", "our") collects, uses, and protects your
          information when you use our websites, mobile applications, and related
          services (the "Service").
        </p>

        <h2>1. Information We Collect</h2>

        <h3>Information you provide</h3>
        <ul>
          <li>
            <strong>Account information</strong> — name, email address, phone
            number, and role (owner, cleaner, or maintenance) when you create an
            account.
          </li>
          <li>
            <strong>Company &amp; property details</strong> — company name,
            property addresses, and related operational data you enter into the
            Service.
          </li>
          <li>
            <strong>Job &amp; scheduling data</strong> — job assignments,
            checklists, completion photos, notes, and availability preferences.
          </li>
          <li>
            <strong>Payment information</strong> — when you make or receive
            payments through the Service, transactions are processed by Stripe.
            We do not store full credit or debit card numbers on our servers.
            Stripe handles your payment credentials in accordance with PCI-DSS
            standards.
          </li>
          <li>
            <strong>Communications</strong> — messages you send through the
            Service or to our support team.
          </li>
        </ul>

        <h3>Information collected automatically</h3>
        <ul>
          <li>
            Device type, browser type, IP address, and general location data.
          </li>
          <li>
            Usage data such as pages visited, features used, and timestamps.
          </li>
          <li>
            Authentication tokens stored in your browser to keep you signed in.
          </li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To operate, maintain, and improve the Service.</li>
          <li>To process transactions and send related notifications.</li>
          <li>To manage scheduling, job assignments, and settlements between users.</li>
          <li>To track affiliate referrals and commission payouts when applicable.</li>
          <li>To communicate with you about your account, updates, and support requests.</li>
          <li>To detect and prevent fraud, abuse, or security incidents.</li>
        </ul>

        <h2>3. How We Share Your Information</h2>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul>
          <li>
            <strong>Stripe</strong> — for payment processing and Stripe Connect
            onboarding. Stripe's use of your data is governed by the{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Other users</strong> — certain information (such as your
            name and role) is visible to other users within your company or to
            partners you collaborate with through shared jobs.
          </li>
          <li>
            <strong>Service providers</strong> — we use third-party hosting,
            analytics, and infrastructure providers who process data on our
            behalf.
          </li>
          <li>
            <strong>Legal obligations</strong> — we may disclose information if
            required by law, regulation, or valid legal process.
          </li>
        </ul>

        <h2>4. Data Retention</h2>
        <p>
          We retain your information for as long as your account is active or as
          needed to provide the Service, comply with legal obligations, resolve
          disputes, and enforce our agreements.
        </p>

        <h2>5. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li>Access the personal information we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your account and associated data.</li>
          <li>Object to or restrict certain processing of your data.</li>
          <li>Request a portable copy of your data.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:support@scrubadub.app">support@scrubadub.app</a>. We
          will respond within a reasonable timeframe.
        </p>

        <h2>6. Security</h2>
        <p>
          We use commercially reasonable technical and organizational measures to
          protect your information. However, no method of transmission over the
          Internet or electronic storage is completely secure, and we cannot
          guarantee absolute security.
        </p>

        <h2>7. Children</h2>
        <p>
          The Service is not directed to individuals under 18. We do not
          knowingly collect personal information from children.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we do, we
          will revise the "Effective" date at the top of this page. We encourage
          you to review this page periodically.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions or concerns about this Privacy Policy? Contact us at{" "}
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
