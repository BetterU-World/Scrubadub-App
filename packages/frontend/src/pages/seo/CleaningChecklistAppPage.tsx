import { useEffect } from "react";
import { Link } from "wouter";
import {
  CheckCircle,
  ClipboardCheck,
  Camera,
  ListChecks,
  ShieldCheck,
  Globe,
  Smartphone,
} from "lucide-react";

const features = [
  { icon: ListChecks, title: "Custom Checklists", description: "Build task-by-task checklists for every property type — turnovers, deep cleans, move-outs, and more." },
  { icon: Camera, title: "Photo Verification", description: "Require photo proof for every checklist item so you can verify work without being on-site." },
  { icon: ShieldCheck, title: "Quality Enforcement", description: "Flag incomplete or skipped tasks automatically. Know what was missed before the client finds out." },
  { icon: Smartphone, title: "Mobile-Friendly for Cleaners", description: "Your team completes checklists on their phone — no training needed, works in English and Spanish." },
  { icon: ClipboardCheck, title: "Built-In SOPs & Manuals", description: "Attach Gold Standard operating procedures directly to checklists so your team always knows the standard." },
  { icon: Globe, title: "Bilingual by Default", description: "Every checklist, notification, and workflow runs in English and Spanish — no extra setup." },
];

export function CleaningChecklistAppPage() {
  useEffect(() => {
    document.title = "Cleaning Checklist App | SCRUB";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "SCRUB's cleaning checklist app lets you build custom checklists with photo verification, enforce quality standards, and track every task across your cleaning team.");
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
          The Cleaning Checklist App That Proves the Work Got Done
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Build custom checklists for every property. Require photo proof for every task. Know exactly what was completed — without being on-site.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>

      {/* Problem */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Checklists on Paper Don't Cut It Anymore
        </h2>
        <p className="text-gray-500">
          Paper checklists get lost. Text-based check-ins get ignored. And when a guest or client complains, you have no proof the work was done. You need a checklist app that holds your team accountable with photo evidence — not just checkboxes.
        </p>
      </section>

      {/* Solution */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Photo-Verified Checklists Your Team Actually Uses
        </h2>
        <p className="text-gray-500">
          SCRUB gives every cleaner a mobile-friendly checklist tied to the specific property they're working on. Each task can require a photo before it's marked complete. You see the results in real time — and you have proof if anyone ever questions the quality.
        </p>
      </section>

      {/* Features */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          More Than Just a Checklist
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
          Who Uses SCRUB's Cleaning Checklists
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Cleaning Companies</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Standardize quality across every cleaner</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Photo proof for client accountability</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Catch missed tasks before complaints</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">STR Operators</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Property-specific turnover checklists</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Verify guest-readiness remotely</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Protect your 5-star reviews</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Team Leads & Managers</h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Monitor completion in real time</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Train new hires with built-in SOPs</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />Reduce rework and callbacks</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to hold your team to a higher standard?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">Start Free Trial</Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">Sign In</Link>
        </div>
      </section>
    </div>
  );
}
