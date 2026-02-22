import { Link } from "wouter";
import { CheckCircle, Award, Building2, Eye } from "lucide-react";

const plans = [
  {
    name: "Cleaning Owner",
    price: "$249",
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
    price: "$499",
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

const valueProps = [
  {
    icon: Award,
    title: "Gold Standard Operations",
    description:
      "Standardized cleaning workflows, inspections, and maintenance tracking in one system.",
  },
  {
    icon: Building2,
    title: "Built for Real Cleaning Businesses",
    description:
      "Manage teams, properties, turnovers, and issues without spreadsheets or group chats.",
  },
  {
    icon: Eye,
    title: "Owner-Level Visibility",
    description:
      "Know what's done, what needs attention, and who completed every job — instantly.",
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
            Get Started
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">
            Sign In
          </Link>
        </div>
      </section>

      {/* Why Scrubadub */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Why Scrubadub?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {valueProps.map((vp) => (
            <div key={vp.title} className="card text-center">
              <div className="inline-flex p-2 rounded-lg bg-primary-100 text-primary-600 mb-3">
                <vp.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-900">{vp.title}</h3>
              <p className="text-sm text-gray-500 mt-2">{vp.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Explanation */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          One Platform. Total Control.
        </h2>
        <p className="text-gray-500">
          Scrubadub replaces scattered tools with one operational system for
          cleaning companies and short-term rental owners. Schedule work, track
          performance, handle maintenance, and train teams using the Gold
          Standard system — all in one place.
        </p>
      </section>

      {/* Pricing */}
      <section className="pb-20 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Simple, Transparent Pricing
        </h2>
        <p className="text-center text-sm text-gray-500 mb-8">
          Built for professional operations, not basic scheduling.
        </p>
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
