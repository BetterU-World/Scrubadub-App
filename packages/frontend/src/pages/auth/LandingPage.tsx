import { useState, useRef, useEffect, useCallback } from "react";
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
  Globe,
  Inbox,
  BookOpen,
  ClipboardCheck,
  Play,
  X,
  RotateCcw,
  Upload,
} from "lucide-react";

const plans = [
  {
    name: "Solo",
    price: "$34.99",
    period: "/mo",
    planKey: "solo",
    description: "For solo operators managing their own cleans.",
    features: [
      "1 cleaner included",
      "Unlimited properties",
      "Job scheduling & tracking",
      "Quality checklists & photo proof",
      "Available in English and Spanish",
      "14-day free trial included",
    ],
  },
  {
    name: "Team",
    price: "$64.99",
    period: "/mo",
    planKey: "team",
    popular: true,
    description: "For small teams ready to grow.",
    features: [
      "Up to 5 cleaners",
      "Unlimited properties",
      "CSV property import",
      "Team scheduling & job tracking",
      "Quality checklists & photo proof",
      "Red flag alerts & maintenance tracking",
      "Available in English and Spanish",
      "14-day free trial included",
    ],
  },
  {
    name: "Pro",
    price: "$149.99",
    period: "/mo",
    planKey: "pro",
    description:
      "For cleaning business owners and property managers running real operations.",
    features: [
      "Unlimited cleaners",
      "Unlimited properties",
      "CSV property import",
      "Team scheduling & job tracking",
      "Quality checklists & photo proof",
      "Red flag alerts & maintenance tracking",
      "Performance analytics",
      "Cleaner payments & partner settlements",
      "Affiliate rewards program",
      "Available in English and Spanish",
      "14-day free trial included",
    ],
  },
];

const valueProps = [
  {
    icon: Award,
    title: "Gold Standard Operations",
    description:
      "Standardized workflows, inspections, and maintenance tracking — with every property set up for operational readiness from day one.",
  },
  {
    icon: Building2,
    title: "Built for Real Cleaning Businesses",
    description:
      "Manage teams, properties, turnovers, and issues — from amenities and access instructions to linens and supplies — without spreadsheets or group chats.",
  },
  {
    icon: Globe,
    title: "Bilingual by Default",
    description:
      "Run your entire operation in English and Spanish — every workflow, checklist, and notification in the language that works best.",
  },
  {
    icon: Eye,
    title: "Owner-Level Visibility",
    description:
      "Know what's done, what needs attention, and who completed every job — instantly.",
  },
  {
    icon: Inbox,
    title: "Client Requests & Booking",
    description:
      "Let clients submit requests and funnel new work directly into your operation.",
  },
  {
    icon: BookOpen,
    title: "Built-In Training & SOPs",
    description:
      "Keep your team aligned with built-in Gold Standard manuals and workflows.",
  },
  {
    icon: Upload,
    title: "Switch Without Rebuilding",
    description:
      "Import your properties in seconds via CSV. No need to rebuild your portfolio manually — get your entire operation running fast.",
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
  {
    icon: RotateCcw,
    text: "Rebuilding your property list every time you switch tools",
  },
];

const steps = [
  {
    num: "1",
    icon: Home,
    title: "Set Up Your Properties",
    description:
      "Import via CSV or add manually — amenities, access instructions, linens, and supplies are captured upfront.",
  },
  {
    num: "2",
    icon: Users,
    title: "Assign Your Team",
    description: "Cleaners and maintenance receive clear job workflows.",
  },
  {
    num: "3",
    icon: ClipboardCheck,
    title: "Verify the Work",
    description:
      "Photo-verified checklists confirm every job meets the Gold Standard.",
  },
  {
    num: "4",
    icon: ShieldCheck,
    title: "Stay in Control",
    description:
      "Track progress, catch issues, and keep your operation running tight.",
  },
];

const VIDEO_SRC = "/videos/Scrub_Owner_Dashboard_User_Guide.mp4";

function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleClose = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl overflow-hidden bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
          aria-label="Close video"
        >
          <X className="w-5 h-5" />
        </button>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          controls
          autoPlay
          className="w-full aspect-video"
        />
      </div>
    </div>
  );
}

export function LandingPage() {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <img src="/favicon-96x96.png" alt="SCRUB" className="w-7 h-7" />
            <span className="text-xl font-bold text-primary-700">SCRUB</span>
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="btn-secondary px-4 py-1.5 text-sm"
            >
              Login
            </Link>
            <Link
              href="/get-started"
              className="btn-primary px-4 py-1.5 text-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 sm:py-24 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 max-w-2xl mx-auto leading-tight">
          Manage your cleaning operations all in one place.
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          The gold standard operations system for cleaning companies and short-term rental teams.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">
            Get Started
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">
            Sign In
          </Link>
        </div>

        {/* Video Preview */}
        <div className="mt-12 max-w-3xl mx-auto">
          <button
            onClick={() => setVideoOpen(true)}
            className="group relative w-full rounded-xl overflow-hidden shadow-lg border border-gray-200 bg-gray-900 aspect-video cursor-pointer transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label="Watch product demo"
          >
            <video
              src={VIDEO_SRC}
              muted
              playsInline
              preload="metadata"
              poster="/images/scrub-demo-poster.png"
              className="w-full h-full object-cover opacity-80 group-hover:opacity-90 transition-opacity"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 shadow-lg group-hover:scale-105 transition-transform">
                <Play className="w-7 h-7 sm:w-9 sm:h-9 text-primary-600 ml-1" />
              </div>
              <span className="mt-3 text-sm font-medium text-white bg-black/40 px-3 py-1 rounded-full">
                Watch Demo
              </span>
            </div>
          </button>
        </div>
      </section>

      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />

      {/* Problem */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Running cleaning operations shouldn't feel chaotic.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
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
          SCRUB replaces scattered communication, manual property rebuilds,
          and guesswork with one operational system built for cleaning
          businesses and short-term rental operators.
        </p>
      </section>

      {/* Why Scrubadub */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Why SCRUB?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
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
          Import your properties. Configure property setup details. Schedule
          work, track performance, and train your team — all from one
          operational system built on the Gold Standard.
        </p>
      </section>

      {/* How It Works */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
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

      {/* Who It's For */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Who SCRUB Is Built For
        </h2>
        <p className="text-center text-sm text-gray-500 mb-8 max-w-xl mx-auto">
          SCRUB works best for cleaning operations that manage real teams, real
          properties, and real accountability.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">
              Cleaning Companies
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li>Manage teams across multiple properties</li>
              <li>Standardize training and inspections</li>
              <li>Track job quality with photo verification</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">
              Short-Term Rental Operators
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li>Import your portfolio and get operational fast</li>
              <li>Coordinate turnovers with full property context</li>
              <li>Catch issues before the next booking</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">
              Growing Cleaning Teams
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-500">
              <li>Replace spreadsheets and group chats</li>
              <li>Keep cleaners accountable and organized</li>
              <li>Run operations from one platform</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pb-16 px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Simple, Transparent Pricing
        </h2>
        <p className="text-center text-sm text-gray-500 mb-8">
          Built for real cleaning operations, not basic scheduling.
        </p>
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.planKey}
              className={`card flex flex-col ${p.popular ? "ring-2 ring-primary-500 relative" : ""}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                {p.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{p.description}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-gray-900">
                  {p.price}
                </span>
                <span className="text-gray-500">{p.period}</span>
              </div>
              <div className="mt-3 mb-1 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-sm font-semibold text-gray-800">
                  <span className="text-green-600">50</span>% OFF first{" "}
                  <span className="text-green-600">3</span> months
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use code <span className="font-mono font-semibold text-gray-700">50OFF3</span> at checkout
                </p>
              </div>
              <ul className="mt-4 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/get-started?plan=${p.planKey}`}
                className="btn-primary w-full text-center mt-6"
              >
                Get Started
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
          SCRUB wasn't designed in a boardroom. It was built alongside
          real cleaning teams solving real operational problems — from property
          setup and turnovers to inspections, maintenance coordination, and
          team accountability.
        </p>
      </section>

      {/* Final CTA */}
      <section className="pb-20 px-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Ready to run your operations the Gold Standard way?
        </h2>
        <div className="flex justify-center gap-3">
          <Link href="/get-started" className="btn-primary px-6 py-2.5">
            Get Started
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-2.5">
            Sign In
          </Link>
        </div>
      </section>
    </div>
  );
}
