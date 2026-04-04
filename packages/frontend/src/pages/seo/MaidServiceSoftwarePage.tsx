import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Users,
  ClipboardCheck,
  Eye,
  Calendar,
  Star,
  MessageSquare,
} from "lucide-react";

const features = [
  { icon: Calendar, title: "Booking & Scheduling", description: "Schedule recurring cleans, one-time visits, and deep cleans — all from one calendar your team can see." },
  { icon: ClipboardCheck, title: "Custom Cleaning Checklists", description: "Create task lists for each home or service type. Require photo proof so clients know the job was done right." },
  { icon: Users, title: "Team Coordination", description: "Assign maids to jobs based on availability and location. Everyone sees their schedule on their phone." },
  { icon: Eye, title: "Job Tracking", description: "See when jobs start, track progress, and know the moment they're marked complete — all in real time." },
  { icon: Star, title: "Client Satisfaction", description: "Catch issues with red flag alerts before clients notice. Maintain the consistency that earns repeat bookings." },
  { icon: MessageSquare, title: "Client Requests", description: "Let clients submit requests and special instructions directly into your workflow — no more back-and-forth texts." },
];

export function MaidServiceSoftwarePage() {
  useEffect(() => {
    document.title = "Maid Service Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is maid service software that helps you schedule jobs, manage your cleaning team, track quality, and keep clients happy — all from one platform.");
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
          Maid Service Software That Keeps Clients Coming Back
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Schedule jobs, coordinate your maids, and deliver consistent quality every visit — with one simple platform built for residential cleaning.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Running a Maid Service on Texts and Memory Doesn't Scale
        </h2>
        <p className="text-gray-500">
          When you started your maid service, a calendar and a phone were enough. But as your client list grows, scheduling gets complicated, quality gets inconsistent, and you spend more time managing logistics than growing your business. One missed appointment or forgotten detail can cost you a long-term client.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          SCRUB Puts Your Maid Service on Autopilot
        </h2>
        <p className="text-gray-500">
          SCRUB gives maid service owners a single place to manage every client, every cleaner, and every job. Your team gets clear schedules with property-specific instructions. You get real-time visibility into every visit — and photo proof that the work meets your standards.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Everything Your Maid Service Needs
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
          Built for Maid Service Businesses
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Solo Maids</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track every client and property</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Build a professional reputation</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Stay organized as you add clients</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Small Maid Teams</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Coordinate schedules across maids</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Ensure consistent quality</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Handle client requests easily</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Growing Services</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Performance analytics per cleaner</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Payments and settlements</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Scale without losing client trust</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to give your maid service the tools it deserves?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
