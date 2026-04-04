import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  Building2,
  Users,
  ClipboardCheck,
  Eye,
  ShieldCheck,
  BarChart3,
} from "lucide-react";

const features = [
  { icon: Building2, title: "Multi-Site Management", description: "Manage offices, retail spaces, warehouses, and other commercial facilities — each with its own setup, supplies, and schedule." },
  { icon: Users, title: "Crew Assignment", description: "Assign dedicated crews or rotating staff to each site. Everyone gets clear instructions and task breakdowns." },
  { icon: ClipboardCheck, title: "Inspection-Ready Checklists", description: "Digital checklists with photo proof that satisfy client audits and help you maintain contract standards." },
  { icon: Eye, title: "Real-Time Oversight", description: "Track which sites have been serviced, which are in progress, and which need attention — across your entire portfolio." },
  { icon: ShieldCheck, title: "Issue Detection", description: "Red flag alerts catch missed areas, late arrivals, and recurring problems before they escalate to client complaints." },
  { icon: BarChart3, title: "Contract-Grade Reporting", description: "Pull performance data and completion reports to demonstrate value to commercial clients at review time." },
];

export function CommercialCleaningSoftwarePage() {
  useEffect(() => {
    document.title = "Commercial Cleaning Software | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB is commercial cleaning software for companies managing office, retail, and facility cleaning. Track crews, inspections, and contract compliance from one platform.");
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
          Commercial Cleaning Software for Multi-Site Operations
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Run your commercial cleaning operation across every office, facility, and retail location — with one platform that keeps crews accountable and clients satisfied.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Commercial Contracts Demand Consistency You Can't Fake
        </h2>
        <p className="text-gray-500">
          Commercial clients expect their facilities cleaned to spec, every time. But when you're managing multiple sites with rotating crews, it's hard to ensure every floor gets mopped, every restroom gets stocked, and every detail meets the contract. Missed tasks lead to complaints, and complaints lead to lost contracts.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          SCRUB Helps You Deliver on Every Contract
        </h2>
        <p className="text-gray-500">
          SCRUB gives commercial cleaning companies a centralized system to manage every site, assign crews, run inspections, and track compliance. Your teams get clear daily task lists. Your managers get real-time dashboards. And when clients ask for proof — you have it.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Purpose-Built for Commercial Cleaning
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
          Who Uses SCRUB for Commercial Cleaning
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Office Cleaning Companies</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Manage nightly and weekend crews</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Photo-verify every visit</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Retain clients with consistent quality</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Facility Service Providers</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Handle diverse site requirements</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Track crew performance by site</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Generate compliance reports</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Multi-Location Operators</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Oversee all sites from one dashboard</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Standardize processes across locations</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Scale operations without losing control</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to protect your contracts with better operations?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
