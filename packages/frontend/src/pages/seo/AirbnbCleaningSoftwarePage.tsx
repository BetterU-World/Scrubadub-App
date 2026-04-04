import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Home,
  ClipboardCheck,
  Eye,
  Calendar,
  ShieldCheck,
  Upload,
} from "lucide-react";

const features = [
  { icon: Home, title: "Property Setup & Import", description: "Import your entire Airbnb portfolio via CSV. Capture amenities, access instructions, linens, and supplies for every listing." },
  { icon: Calendar, title: "Turnover Scheduling", description: "Schedule turnovers, deep cleans, and maintenance jobs — so nothing gets missed between bookings." },
  { icon: ClipboardCheck, title: "Photo-Verified Checklists", description: "Every clean is verified with photo proof against your custom checklist before the next guest arrives." },
  { icon: Eye, title: "Real-Time Job Tracking", description: "See exactly what's been completed, what's in progress, and what needs attention — across all your listings." },
  { icon: ShieldCheck, title: "Red Flag Alerts", description: "Get notified about missed tasks, late starts, and maintenance issues before they become guest complaints." },
  { icon: Upload, title: "Switch Without Rebuilding", description: "Migrate from spreadsheets or other tools in seconds. No need to rebuild your property list from scratch." },
];

export function AirbnbCleaningSoftwarePage() {
  useEffect(() => {
    document.title = "Airbnb Cleaning Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is the Airbnb cleaning software built for short-term rental operators. Manage turnovers, cleaners, checklists, and quality across all your listings.");
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
          Airbnb Cleaning Software for Short-Term Rental Operators
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Coordinate turnovers, manage cleaners, and verify quality across all your Airbnb listings — without the chaos of texts and spreadsheets.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Turnover Day Shouldn't Be a Fire Drill
        </h2>
        <p className="text-gray-500">
          Every Airbnb host knows the feeling: a checkout happens, a cleaner is running late, and the next guest checks in at 3pm. When you're managing multiple listings, coordinating turnovers through texts and memory doesn't scale. One missed clean can mean a bad review, a refund, or a lost superhost status.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          SCRUB Keeps Every Turnover on Track
        </h2>
        <p className="text-gray-500">
          SCRUB gives short-term rental operators a single system to manage every turnover. Your cleaners get clear job details with property-specific instructions. You get real-time visibility and photo-verified proof that every listing is guest-ready. No more guesswork.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Built for the Way STR Operators Actually Work
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
          Who Uses SCRUB for Airbnb Cleaning
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Airbnb Hosts</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Manage turnovers across listings</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Verify cleans with photo proof</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Protect your guest reviews</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Property Managers</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Import your full portfolio</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Coordinate cleaning teams at scale</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track quality across every property</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Cleaning Companies</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Serve multiple STR clients</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Standardize your turnover process</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Scale with confidence</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to make every turnover guest-ready?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
