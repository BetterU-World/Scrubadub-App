import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Home,
  Users,
  ClipboardCheck,
  Eye,
  Calendar,
  Upload,
} from "lucide-react";

const features = [
  { icon: Home, title: "Client & Home Management", description: "Store every client's home details — entry codes, pet info, special instructions, and cleaning preferences — in one profile." },
  { icon: Calendar, title: "Smart Scheduling", description: "Set up weekly, biweekly, or custom recurring schedules. Assign cleaners and manage availability from one calendar." },
  { icon: ClipboardCheck, title: "Cleaning Checklists", description: "Create room-by-room checklists tailored to each home. Require photos so clients can see the results." },
  { icon: Users, title: "Cleaner Management", description: "Assign jobs, track who's working where, and keep your team accountable without micromanaging." },
  { icon: Eye, title: "Owner Dashboard", description: "See every scheduled job, active clean, and completed task across your entire client base at a glance." },
  { icon: Upload, title: "Easy Onboarding", description: "Import your client list via CSV and start scheduling in minutes — no need to rebuild from scratch." },
];

export function HouseCleaningBusinessSoftwarePage() {
  useEffect(() => {
    document.title = "House Cleaning Business Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is house cleaning business software that helps you manage clients, schedules, cleaners, and quality — built for residential cleaning companies that want to grow.");
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
          House Cleaning Business Software That Grows With You
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Manage your clients, schedule recurring cleans, and keep your team delivering consistent quality — all from one platform designed for house cleaning businesses.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Your House Cleaning Business Deserves Better Than a Spreadsheet
        </h2>
        <p className="text-gray-500">
          You started cleaning homes because you're great at it — not because you love juggling calendars, chasing down your team, and remembering every client's special requests. As your client list grows, the admin work grows faster. You need a system that handles the logistics so you can focus on delivering great cleans.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          SCRUB Runs Your House Cleaning Business Behind the Scenes
        </h2>
        <p className="text-gray-500">
          SCRUB stores every client's home details, schedules recurring cleans automatically, and gives your cleaners clear task lists for every visit. You see everything happening across your business in one dashboard — and you have photo proof of every completed job to share with clients.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Built for Residential Cleaning Operations
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
          Perfect for Every Stage of Your House Cleaning Business
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Just Getting Started</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Organize clients from day one</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Look professional with checklists</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Affordable solo plan</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Building a Team</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Assign cleaners to homes</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Maintain quality with photo proof</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Stop relying on group chats</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Scaling Up</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Unlimited properties and cleaners</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Performance analytics</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Cleaner payments built in</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to run your house cleaning business like a pro?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
