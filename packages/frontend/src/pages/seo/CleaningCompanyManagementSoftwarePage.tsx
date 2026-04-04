import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Users,
  ClipboardCheck,
  Eye,
  BarChart3,
  ShieldCheck,
  Globe,
} from "lucide-react";

const features = [
  { icon: Users, title: "Team Management", description: "Assign cleaners and maintenance staff to properties. Everyone gets clear job details and accountability." },
  { icon: ClipboardCheck, title: "Quality Verification", description: "Photo-verified checklists ensure every job meets your standards — no more taking anyone's word for it." },
  { icon: Eye, title: "Full Visibility", description: "See what's done, what's in progress, and what needs attention across your entire operation in real time." },
  { icon: BarChart3, title: "Performance Analytics", description: "Track cleaner performance, job completion rates, and quality metrics to make smarter decisions." },
  { icon: ShieldCheck, title: "Red Flags & Alerts", description: "Automated alerts catch missed tasks, late starts, and recurring issues before they become problems." },
  { icon: Globe, title: "Bilingual Operations", description: "Run your entire operation in English and Spanish — every workflow, checklist, and notification." },
];

export function CleaningCompanyManagementSoftwarePage() {
  useEffect(() => {
    document.title = "Cleaning Company Management Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is cleaning company management software that helps you manage teams, properties, schedules, quality, and performance — all from one platform.");
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="SCRUB" className="w-7 h-7" />
            <img src="/logo-word.png" alt="SCRUB" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary px-4 py-1.5 text-sm">Login</Link>
            <Link href="/get-started" className="btn-primary px-4 py-1.5 text-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 sm:py-24 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 max-w-3xl mx-auto leading-tight">
          Cleaning Company Management Software Built for Real Operations
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Manage your cleaning company's teams, properties, schedules, and quality from one platform — built by operators who've been in your shoes.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Managing a Cleaning Company Gets Harder as You Grow
        </h2>
        <p className="text-gray-500">
          When you started, you could keep track of everything yourself. But now you have a team, dozens of properties, and clients expecting consistent quality. Group chats and spreadsheets can't keep up. You need a management system that scales with your business — without the complexity of enterprise software.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          SCRUB Is the Operating System for Your Cleaning Company
        </h2>
        <p className="text-gray-500">
          SCRUB brings your properties, team, schedules, and quality standards into one platform. Your cleaners know exactly what to do. Your managers can track progress. And you get the visibility you need to grow with confidence — without micromanaging every job.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Manage Every Part of Your Cleaning Company
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((f) => (
            <div key={f.title} className="card text-center">
              <div className="inline-flex p-2 rounded-lg bg-primary-100 text-primary-600 mb-3">
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-500 mt-2">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who It's For */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Built for Every Stage of Growth
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">New Companies</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Start organized from day one</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Built-in training & SOPs</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Affordable plans that grow with you</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Established Teams</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Replace scattered tools</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Standardize quality across cleaners</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track performance and accountability</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Scaling Operations</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Unlimited cleaners & properties</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Cleaner payments & settlements</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Advanced analytics & insights</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to manage your cleaning company the right way?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
