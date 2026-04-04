import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Building2,
  Users,
  ClipboardCheck,
  Eye,
  Calendar,
  BarChart3,
} from "lucide-react";

const features = [
  { icon: Building2, title: "Facility & Site Management", description: "Set up each facility with its own floor plan, supply requirements, and access details — all in one place." },
  { icon: Users, title: "Crew Scheduling", description: "Assign janitorial crews to recurring shifts or one-off jobs with clear task breakdowns and accountability." },
  { icon: ClipboardCheck, title: "Inspection Checklists", description: "Digital checklists with photo verification replace paper logs and ensure consistent cleaning standards." },
  { icon: Eye, title: "Supervisor Visibility", description: "Supervisors and account managers see job progress in real time — no need to walk the building." },
  { icon: Calendar, title: "Recurring Job Scheduling", description: "Set up daily, weekly, or custom cleaning schedules that automatically assign to the right crew." },
  { icon: BarChart3, title: "Performance Tracking", description: "Track completion rates, response times, and quality scores to keep your contracts healthy." },
];

export function JanitorialSoftwarePage() {
  useEffect(() => {
    document.title = "Janitorial Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is janitorial software that helps you manage crews, facilities, inspections, and schedules — built for janitorial companies running real operations.");
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
          Janitorial Software That Keeps Your Crews and Contracts on Track
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Manage janitorial crews, facility schedules, inspections, and quality standards from one platform — no more clipboard logs and missed shifts.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Paper Logs and Spreadsheets Can't Run a Janitorial Operation
        </h2>
        <p className="text-gray-500">
          Janitorial companies juggle multiple facilities, rotating crews, and strict contract standards. When you're relying on paper inspection forms, phone calls, and memory, things get missed — restrooms don't get stocked, floors don't get done, and complaints pile up. You need software that matches the pace of your operation.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          One System for Every Facility You Service
        </h2>
        <p className="text-gray-500">
          SCRUB gives janitorial companies a single platform to manage every site, every crew, and every inspection. Your staff gets clear daily task lists. Your supervisors get real-time visibility. And you get the data to prove your work meets contract standards — without chasing anyone down.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Built for the Way Janitorial Companies Operate
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
          Who Uses SCRUB for Janitorial Operations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Janitorial Companies</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Manage multiple facilities</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Schedule recurring shifts</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Prove compliance to clients</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Facility Managers</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track cleaning completion</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Report maintenance issues</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Hold vendors accountable</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Operations Managers</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Oversee all crews from one dashboard</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track performance metrics</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Reduce client complaints</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to run your janitorial operation with confidence?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
