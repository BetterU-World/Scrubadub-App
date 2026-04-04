import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Building2,
  Users,
  ClipboardCheck,
  Eye,
  Calendar,
  ShieldCheck,
} from "lucide-react";

const features = [
  { icon: Building2, title: "Property Management", description: "Import properties via CSV or add manually — with amenities, access instructions, and supplies captured upfront." },
  { icon: Users, title: "Team Scheduling", description: "Assign cleaners and maintenance staff to jobs with clear workflows and accountability." },
  { icon: ClipboardCheck, title: "Quality Checklists", description: "Photo-verified checklists confirm every job meets your standards before the next guest arrives." },
  { icon: Eye, title: "Real-Time Visibility", description: "Know what's done, what needs attention, and who completed every job — instantly." },
  { icon: Calendar, title: "Job Scheduling & Tracking", description: "Schedule turnovers, deep cleans, and maintenance — all from one calendar." },
  { icon: ShieldCheck, title: "Red Flag Alerts", description: "Catch issues early with automated alerts for missed tasks, late starts, and quality problems." },
];

export function CleaningBusinessSoftwarePage() {
  useEffect(() => {
    document.title = "Cleaning Business Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is the all-in-one cleaning business software to manage properties, teams, schedules, checklists, and quality — built for real cleaning operations.");
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
          Cleaning Business Software That Runs Your Entire Operation
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Stop juggling spreadsheets, group chats, and guesswork. SCRUB gives cleaning business owners one platform to manage properties, teams, and quality.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Growing a Cleaning Business Is Hard Without the Right Tools
        </h2>
        <p className="text-gray-500">
          Most cleaning business owners rely on texts, spreadsheets, and memory to manage their operations. As your team and property list grow, things fall through the cracks — missed cleans, miscommunication, and no way to verify quality. You need software built for how cleaning businesses actually work.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          One Platform for Your Entire Cleaning Operation
        </h2>
        <p className="text-gray-500">
          SCRUB replaces scattered tools with a single operational system. Import your properties, assign your team, track every job, and verify quality — all from one place. Built by operators who understand what it takes to run a real cleaning business.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Everything You Need to Run Your Cleaning Business
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
          Built for Cleaning Business Owners Who Want Control
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Solo Operators</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track every job and property</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Photo-verified checklists</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Stay organized as you grow</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Small Teams</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Assign work to cleaners</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Replace group chats</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Catch issues before clients do</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Growing Operations</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Performance analytics</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Cleaner payments & settlements</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Scale without losing quality</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to run your cleaning business the right way?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
