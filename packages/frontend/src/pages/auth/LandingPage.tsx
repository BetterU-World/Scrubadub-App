import { Link } from "wouter";
import {
  CheckCircle,
  Award,
  Building2,
  Eye,
  AlertTriangle,
  MessageSquare,
  EyeOff,
  Home,
  Users,
  ShieldCheck,
} from "lucide-react";

const plans = [
  {
    name: "Cleaning Owner",
    price: "$249",
    period: "/mo",
    description: "For cleaning business owners managing teams and properties.",
    subtitle:
      "Perfect for cleaning companies managing multiple clients or properties.",
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
    subtitle:
      "For hosts and property managers who need reliable turnovers and maintenance tracking.",
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

const problems = [
  {
    icon: AlertTriangle,
    text: "Missed cleans and last-minute surprises",
  },
  {
    icon: MessageSquare,
    text: "Endless texts, calls, and group chats",
  },
  {
    icon: EyeOff,
    text: "No visibility into what was actually completed",
  },
];

const steps = [
  {
    num: "1",
    icon: Home,
    title: "Set Up Your Properties",
    description: "Add units, amenities, and turnover details once.",
  },
  {
    num: "2",
    icon: Users,
    title: "Assign Your Team",
    description: "Cleaners and maintenance receive clear job workflows.",
  },
  {
    num: "3",
    icon: ShieldCheck,
    title: "Stay in Control",
    description:
      "Track progress, approve work, and catch issues instantly.",
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

      {/* Problem */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Running cleaning operations shouldn't feel chaotic.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {problems.map((p) => (
            <div key={p.text} className="card text-center">
              <div className="inline-flex p-2 rounded-lg bg-red-100 text-red-600 mb-3">
                <p.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-gray-700">{p.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-gray-500 text-center max-w-2xl mx-auto">
          Scrubadub replaces scattered communication, spreadsheets, and
          guesswork with one operational system built specifically for cleaning
          businesses and short-term rental operators.
        </p>
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

      {/* How It Works */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {steps.map((s) => (
            <div key={s.num} className="card text-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold mb-3">
                {s.num}
              </div>
              <div className="inline-flex p-2 rounded-lg bg-primary-100 text-primary-600 mb-3 ml-2">
                <s.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-900">{s.title}</h3>
              <p className="text-sm text-gray-500 mt-2">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="pb-16 px-4">
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
              <p className="text-xs text-gray-400 mt-1">{plan.subtitle}</p>
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
                Start Operating Smarter
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="pb-16 px-4 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Built From Real Cleaning Operations
        </h2>
        <p className="text-gray-500">
          Scrubadub wasn't designed in a boardroom. It was built alongside real
          cleaning teams solving real operational problems — from turnovers and
          inspections to maintenance coordination and team accountability.
        </p>
      </section>

      {/* Final CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to run your operations the Gold Standard way?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-2.5">
            Create Your Account
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">
            Sign In
          </Link>
        </div>
      </section>
    </div>
  );
}
