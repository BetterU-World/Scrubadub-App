import { Link } from "wouter";
import { CheckCircle } from "lucide-react";

const plans = [
  {
    name: "Cleaning Owner",
    price: "$49",
    period: "/mo",
    description: "For cleaning business owners managing teams and properties.",
    features: [
      "Unlimited properties",
      "Team scheduling & job tracking",
      "Quality checklists & photo proof",
      "Red flag alerts",
      "Performance analytics",
    ],
    ownerType: "cleaning",
  },
  {
    name: "STR Owner / Property Manager",
    price: "$79",
    period: "/mo",
    description: "For short-term rental owners and property managers.",
    features: [
      "Everything in Cleaning Owner",
      "Turnover & move-in/out jobs",
      "Multi-property calendar",
      "Maintenance job tracking",
      "Priority support",
    ],
    ownerType: "str",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-xl font-bold text-primary-700">ScrubaDub</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="btn-secondary px-4 py-1.5 text-sm"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="btn-primary px-4 py-1.5 text-sm"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 sm:py-24 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 max-w-2xl mx-auto leading-tight">
          Gold Standard Cleaning Operations
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Schedule jobs, track quality with photo-verified checklists, and manage
          your entire cleaning team from one simple dashboard.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-2.5">
            Get Started Free
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">
            Sign In
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="pb-20 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Simple, Transparent Pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div key={plan.ownerType} className="card flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900">
                {plan.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-gray-500">{plan.period}</span>
              </div>
              <ul className="mt-4 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?ownerType=${plan.ownerType}`}
                className="btn-primary w-full text-center mt-6"
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
