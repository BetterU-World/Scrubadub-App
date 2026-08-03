import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Globe2,
  Home,
  Inbox,
  Menu,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { isOperationsAssessmentEnabled } from "../../lib/assessmentFeature";

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
    description: "For cleaning business owners and property managers running large operations.",
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

const lifecycle = [
  { label: "Capture", detail: "Leads & requests", icon: Inbox },
  { label: "Scope", detail: "Walkthroughs", icon: ClipboardCheck },
  { label: "Win", detail: "Proposals & agreements", icon: FileCheck2 },
  { label: "Schedule", detail: "Recurring services", icon: Sparkles },
  { label: "Deliver", detail: "Jobs & field teams", icon: Users },
  { label: "Get paid", detail: "Payments & invoices", icon: CircleDollarSign },
  { label: "Improve", detail: "Reporting & insights", icon: BarChart3 },
];

const platformDepth = [
  { icon: Globe2, title: "Win work online", copy: "Company microsites and service requests bring new opportunities directly into your operation." },
  { icon: FileText, title: "Keep documents organized", copy: "Manage onboarding, company documents, manuals, and service agreements alongside the work." },
  { icon: CircleDollarSign, title: "Keep money moving", copy: "Track client payments, cleaner payments, partner settlements, and commercial invoices." },
  { icon: BarChart3, title: "Know what needs attention", copy: "Use reporting, performance insights, inspections, photo proof, and issue escalation to protect quality." },
  { icon: Globe2, title: "Work in English or Spanish", copy: "Give teams consistent operational guidance in the language that works for them." },
  { icon: Sparkles, title: "Reduce repetitive coordination", copy: "Recurring schedules, reminders, and workflow automation keep routine work moving." },
];

const faqs = [
  {
    question: "Is SCRUB only scheduling software?",
    answer: "No. Scheduling is one part of SCRUB. The platform also supports leads and requests, walkthroughs, proposals, service agreements, recurring work, job delivery, client and worker experiences, payments, documents, and reporting.",
  },
  {
    question: "What types of cleaning businesses is SCRUB built for?",
    answer: "SCRUB is purpose-built for residential and maid-service businesses, commercial and janitorial companies, and short-term-rental or turnover operations.",
  },
  {
    question: "Does SCRUB support commercial cleaning?",
    answer: "Yes. SCRUB includes commercial accounts, recurring commercial schedules, service relationships, invoicing, reporting, and operational oversight.",
  },
  {
    question: "What can clients do in the client portal?",
    answer: "Clients can review their service relationship, see upcoming and recurring services, manage requests, review proposals and agreements, and view payment information available to them.",
  },
  {
    question: "What do cleaners and maintenance workers see?",
    answer: "Workers receive a role-appropriate mobile dashboard with assigned work, job details, availability, documents, onboarding items, manuals, payments, and relevant maintenance workflows.",
  },
  {
    question: "Can I use SCRUB from my phone?",
    answer: "Yes. SCRUB is responsive across owner, client, and worker experiences, so the business can keep moving at the desk, in the truck, or at the job site. SCRUB is a web application and does not require a native mobile app.",
  },
  {
    question: "Does SCRUB support English and Spanish?",
    answer: "Yes. SCRUB supports English and Spanish across operational workflows, helping owners and field teams work with consistent information.",
  },
  {
    question: "Can I import existing business information?",
    answer: "SCRUB supports CSV property imports so you can bring existing property information into the platform without rebuilding every record manually.",
  },
  {
    question: "How do proposals and service agreements work?",
    answer: "Owners can prepare and send professional proposals, capture the client's response, and send service agreements for signing as work moves toward active service.",
  },
  {
    question: "Which plan is right for my company?",
    answer: "Solo is designed for an owner completing their own cleans, Team supports up to five cleaners, and Pro supports unlimited cleaners plus advanced operational capabilities. Review the plan details below before starting your trial.",
  },
  {
    question: "What happens during and after the free trial?",
    answer: "Each plan includes a 14-day free trial with no charge today. The selected monthly subscription continues after the trial unless it is canceled.",
  },
  {
    question: "How is account access protected?",
    answer: "SCRUB uses protected account access and role-specific experiences for owners, clients, and workers, with dedicated invitation and sign-in flows for the people connected to your business.",
  },
];

function SectionHeading({ eyebrow, title, copy, centered = false }: { eyebrow: string; title: string; copy?: string; centered?: boolean }) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{title}</h2>
      {copy && <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">{copy}</p>}
    </div>
  );
}

function AnchorLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="touch-target inline-flex items-center justify-center text-sm font-medium text-gray-600 transition hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">{children}</a>;
}

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-gray-900">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/95 backdrop-blur">
        <nav aria-label="Main navigation" className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="#top" aria-label="SCRUB home" className="touch-target flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <img src="/logo-icon.png" alt="" className="h-8 w-8" />
            <img src="/logo-word.png" alt="SCRUB" className="h-7 w-auto" />
          </a>
          <div className="hidden items-center gap-6 md:flex">
            <AnchorLink href="#platform">Platform</AnchorLink>
            <AnchorLink href="#solutions">Solutions</AnchorLink>
            <AnchorLink href="#pricing">Pricing</AnchorLink>
            <AnchorLink href="#faq">FAQ</AnchorLink>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="touch-target hidden items-center px-3 text-sm font-medium text-gray-600 hover:text-primary-700 sm:inline-flex">Log in</Link>
            <Link href="/get-started" className="btn-primary touch-target whitespace-nowrap px-4 text-sm">Start free</Link>
            <details className="relative md:hidden">
              <summary aria-label="Open navigation menu" className="touch-target flex cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 [&::-webkit-details-marker]:hidden">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-12 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                <a href="#platform" className="touch-target flex items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Platform</a>
                <a href="#solutions" className="touch-target flex items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Solutions</a>
                <a href="#pricing" className="touch-target flex items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Pricing</a>
                <a href="#faq" className="touch-target flex items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">FAQ</a>
                <Link href="/login" className="touch-target flex items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:hidden">Log in</Link>
              </div>
            </details>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="relative px-4 py-16 sm:px-6 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Purpose-built for cleaning businesses
              </p>
              <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                The operating system for modern cleaning businesses.
              </h1>
              <p className="mt-6 text-xl font-semibold text-primary-700 sm:text-2xl">Everything your cleaning business needs. Nothing it doesn&apos;t.</p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                Connect sales, recurring service, field teams, clients, payments, and reporting in one cleaning-specific platform—without holding every detail together yourself.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/get-started" className="btn-primary touch-target inline-flex w-full items-center justify-center gap-2 px-6 sm:w-auto">
                  Start 14 days free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a href="#product-proof" className="btn-secondary touch-target inline-flex w-full items-center justify-center gap-2 px-6 sm:w-auto">
                  See how SCRUB works <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-3 text-sm text-gray-500">No charge today. Choose the plan that fits your operation.</p>
            </div>

            <div className="relative rounded-3xl border border-gray-200 bg-gray-900 p-2 shadow-2xl shadow-gray-300/70 sm:p-3">
              <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-green-300" /><span className="ml-2 text-xs text-gray-400">Example SCRUB workspace</span></div>
              <ProductVisual
                alt="Example SCRUB owner dashboard showing jobs, requests, and operational alerts."
                avif="/images/product-proof/product-proof-owner-dashboard-1200.avif"
                webp="/images/product-proof/product-proof-owner-dashboard-1200.webp"
                mobileAvif="/images/product-proof/product-proof-owner-dashboard-mobile-415.avif"
                mobileWebp="/images/product-proof/product-proof-owner-dashboard-mobile-415.webp"
                width={1200}
                height={860}
                eager
                className="aspect-[1200/860] rounded-2xl object-cover object-top"
              />
            </div>
          </div>
        </section>

        <section aria-label="Product credibility" className="border-y border-gray-200 bg-gray-50 px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="rounded-full bg-primary-100 p-3 text-primary-700"><BriefcaseBusiness className="h-6 w-6" aria-hidden="true" /></div>
            <div>
              <p className="font-semibold text-gray-900">Built from real cleaning operations—not adapted from generic field-service software.</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">SCRUB brings the people, documents, client relationships, and daily work of a cleaning company into one purpose-built system.</p>
            </div>
          </div>
        </section>

        <section id="product-proof" className="scroll-mt-20 bg-gray-50 px-4 py-20 sm:px-6 sm:py-24">
          <ProductProofSection
            eyebrow="For owners"
            title="See the whole operation—and what needs attention next"
            copy="Requests, active work, approvals, schedules, teams, red flags, and maintenance stay visible in one operational workspace."
            bullets={["See today’s operational picture", "Track jobs, approvals, and red flags", "Coordinate properties, workers, and schedules", "Keep the business organized from one workspace"]}
          >
            <FramedVisual label="Example SCRUB workspace">
              <ProductVisual alt="Example SCRUB owner dashboard showing upcoming jobs and operational alerts." avif="/images/product-proof/product-proof-owner-operations-1200.avif" webp="/images/product-proof/product-proof-owner-operations-1200.webp" width={1200} height={500} className="aspect-[12/5] object-cover object-top" />
            </FramedVisual>
          </ProductProofSection>
        </section>

        <ConnectedOperationBridge />

        <section id="worker-product-proof" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
          <ProductProofSection
            eyebrow="For workers"
            title="Everything the team needs where the work happens"
            copy="Workers can see assigned work, understand property and schedule details, follow the cleaning plan, add completed-cleaning photos, and submit work for review."
            bullets={["Open the assigned Riverstone job", "Review access instructions and required add-ons", "Follow checklists and cleaning guidance", "Document and submit completed work"]}
            reverse
          >
            <div className="mx-auto grid max-w-xs grid-cols-1 items-start gap-5 sm:max-w-xl sm:grid-cols-2" aria-label="Example Worker Showcase screens">
              <PhoneVisual><ProductVisual alt="Example worker workspace showing today’s assigned Riverstone cleaning job." avif="/images/product-proof/product-proof-worker-home-375.avif" webp="/images/product-proof/product-proof-worker-home-375.webp" width={375} height={812} className="aspect-[375/812] object-cover object-top" /></PhoneVisual>
              <PhoneVisual className="sm:mt-8"><ProductVisual alt="Example worker job detail showing Riverstone property and schedule information." avif="/images/product-proof/product-proof-worker-job-375.avif" webp="/images/product-proof/product-proof-worker-job-375.webp" width={375} height={812} className="aspect-[375/812] object-cover object-top" /></PhoneVisual>
            </div>
          </ProductProofSection>
        </section>

        <section id="client-product-proof" className="scroll-mt-20 bg-gray-50 px-4 py-20 sm:px-6 sm:py-24">
          <ProductProofSection
            eyebrow="For clients"
            title="Your clients always know what is happening and what comes next"
            copy="A dedicated client portal brings current service, requests, confirmed schedules, documents, billing, and locations into one professional relationship."
            bullets={["See current and upcoming service", "Follow each request from submission to scheduling", "Understand requested versus confirmed timing", "Keep documents, billing, and service locations close"]}
          >
            <div className="grid gap-4">
              <FramedVisual label="Example SCRUB client workspace"><ProductVisual alt="Example client portal showing current service, recent activity, and items needing attention." avif="/images/product-proof/product-proof-client-home-1024.avif" webp="/images/product-proof/product-proof-client-home-1024.webp" width={1024} height={768} className="aspect-[4/3] object-cover object-top" /></FramedVisual>
              <div className="ml-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-2 shadow-xl sm:w-3/4"><ProductVisual alt="Example client portal showing a confirmed cleaning-request timeline." avif="/images/product-proof/product-proof-client-request-timeline-753.avif" webp="/images/product-proof/product-proof-client-request-timeline-753.webp" width={753} height={1004} className="aspect-[753/1004] rounded-xl object-cover object-top" /></div>
            </div>
          </ProductProofSection>
        </section>

        <section id="platform" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading centered eyebrow="The connected lifecycle" title="From first request to repeatable service" copy="SCRUB keeps the business context moving as your team turns an opportunity into ongoing work. Each stage stays clear without pretending the important decisions happen automatically." />
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
              {lifecycle.map((step, index) => (
                <li key={step.label} className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><step.icon className="h-5 w-5" aria-hidden="true" /></span><span className="text-xs font-bold text-gray-300">{String(index + 1).padStart(2, "0")}</span></div>
                  <h3 className="mt-4 font-semibold text-gray-900">{step.label}</h3><p className="mt-1 text-sm leading-5 text-gray-500">{step.detail}</p>
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-8 max-w-3xl text-center text-base leading-7 text-gray-600">Capture leads and requests, scope the work through walkthroughs, send proposals and agreements, build recurring schedules, equip the team, keep clients informed, and review the results.</p>
          </div>
        </section>

        <section id="solutions" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading centered eyebrow="Purpose-built solutions" title="Built around the way cleaning businesses actually operate" copy="Different cleaning models need different operational detail. SCRUB supports each without making one the default identity of the platform." />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              <SolutionCard icon={Home} title="Residential & maid service" copy="Turn new leads into recurring client relationships with proposals, agreements, team coordination, and client visibility." items={["Leads and recurring clients", "Proposals and service agreements", "Team and client experiences"]} />
              <SolutionCard icon={Building2} title="Commercial & janitorial" copy="Manage long-running service relationships with dedicated commercial workflows and operational oversight." items={["Commercial accounts", "Recurring schedules and invoicing", "Reporting and service oversight"]} />
              <SolutionCard icon={Sparkles} title="Short-term rental & turnover" copy="Give field teams the property context they need while keeping fast-moving turnovers and maintenance organized." items={["Detailed property information", "Access, linens, and supplies", "Turnovers and maintenance coordination"]} />
            </div>
          </div>
        </section>

        <section className="border-y border-gray-200 bg-gray-50 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="Platform depth" title="The supporting systems are already connected" copy="Once the core operation is clear, SCRUB adds the practical tools that keep standards, people, payments, and growth organized." />
            <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
              {platformDepth.map((item) => <div key={item.title} className="flex gap-4"><span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm"><item.icon className="h-5 w-5" aria-hidden="true" /></span><div><h3 className="font-semibold text-gray-900">{item.title}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{item.copy}</p></div></div>)}
            </div>
          </div>
        </section>

        {isOperationsAssessmentEnabled && <section className="px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="assessment-heading">
          <div className="mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-3xl bg-gray-900 px-6 py-10 text-white sm:px-10 sm:py-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-300">A useful place to start</p>
              <h2 id="assessment-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Not ready for the platform yet? Find the next operational priority.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300 sm:text-lg">Complete the free Operations Assessment for an Operations Score, Confidence Score, and personalized roadmap. No account or commitment required.</p>
              <Link href="/assessment" className="btn-primary touch-target mt-7 inline-flex w-full items-center justify-center gap-2 px-6 sm:w-auto">Get your free Operations Assessment <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1" aria-label="Operations Assessment results">
              {["Operations Score", "Confidence Score", "Personalized roadmap"].map((item) => <li key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold"><CheckCircle className="h-5 w-5 flex-none text-primary-300" aria-hidden="true" />{item}</li>)}
            </ul>
          </div>
        </section>}

        <section aria-labelledby="trust-heading" className="bg-primary-50 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 md:grid-cols-[.9fr_1.1fr] md:items-center">
              <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">Professional by design</p><h2 id="trust-heading" className="mt-3 text-3xl font-bold tracking-tight text-gray-900">Clear access. Clear records. Clear relationships.</h2></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TrustItem icon={ShieldCheck} title="Protected access" copy="Dedicated sign-in and invitation flows help connect the right people." />
                <TrustItem icon={UserCheck} title="Role-based experiences" copy="Owners, clients, and workers see the tools relevant to them." />
                <TrustItem icon={FileCheck2} title="Professional records" copy="Documents, approvals, service history, and payments stay organized." />
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading centered eyebrow="Pricing" title="Choose the plan that fits your operation" copy="Every plan includes a 14-day free trial. Start with the team size and operational depth your business needs today." />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.planKey} className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${plan.popular ? "border-primary-500 ring-1 ring-primary-500" : "border-gray-200"}`}>
                  {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">Most Popular</span>}
                  <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-gray-600">{plan.description}</p>
                  <p className="mt-5"><span className="text-4xl font-bold text-gray-900">{plan.price}</span><span className="text-gray-500">{plan.period}</span></p>
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-center"><p className="text-sm font-semibold text-gray-800"><span className="text-green-700">50% OFF</span> first 3 months</p><p className="mt-0.5 text-xs text-gray-500">Use code <span className="font-mono font-semibold text-gray-700">50OFF3</span> at checkout</p></div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm text-gray-600"><CheckCircle className="mt-0.5 h-4 w-4 flex-none text-primary-600" aria-hidden="true" />{feature}</li>)}
                  </ul>
                  <Link href={`/get-started?plan=${plan.planKey}`} className="btn-primary touch-target mt-7 inline-flex w-full items-center justify-center">Start 14 days free</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-y border-gray-200 bg-gray-50 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <SectionHeading centered eyebrow="FAQ" title="Questions before you start" copy="Straight answers about where SCRUB fits and how the platform works." />
            <div className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-1">
                  <summary className="touch-target flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-details-marker]:hidden">
                    {faq.question}<ChevronRight className="h-5 w-5 flex-none text-gray-400 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <p className="max-w-2xl pb-5 pr-8 text-sm leading-6 text-gray-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">One connected business. More room to grow.</h2>
            <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">Replace scattered coordination with clearer work, more professional client relationships, and a team that knows what comes next.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap"><Link href="/get-started" className="btn-primary touch-target inline-flex w-full items-center justify-center gap-2 px-6 sm:w-auto">Start 14 days free <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link><a href="#product-proof" className="btn-secondary touch-target inline-flex w-full items-center justify-center px-6 sm:w-auto">See how SCRUB works</a></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-gray-900 px-4 py-12 text-gray-300 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div><div className="flex items-center gap-2"><img src="/logo-icon.png" alt="" className="h-8 w-8" /><span className="text-xl font-bold text-white">SCRUB</span></div><p className="mt-4 max-w-sm text-sm leading-6 text-gray-400">The operating system for modern cleaning businesses. Built for residential, commercial, and short-term-rental operations.</p></div>
          <FooterGroup title="Platform" links={[["Platform", "#platform"], ["Pricing", "#pricing"], ["FAQ", "#faq"], ["Log in", "/login"]]} />
          <FooterGroup title="Solutions" links={[["Residential cleaning", "/house-cleaning-business-software"], ["Commercial cleaning", "/commercial-cleaning-software"], ["Janitorial companies", "/janitorial-software"], ["Short-term rentals", "/airbnb-cleaning-software"]]} />
          <FooterGroup title="Company" links={[["Contact", "/contact"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Start free", "/get-started"]]} />
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-white/10 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} SCRUB. All rights reserved.</p><p>Everything your cleaning business needs. Nothing it doesn&apos;t.</p></div>
      </footer>
    </div>
  );
}

function ProductVisual({ alt, avif, webp, mobileAvif, mobileWebp, width, height, eager = false, className = "" }: { alt: string; avif: string; webp: string; mobileAvif?: string; mobileWebp?: string; width: number; height: number; eager?: boolean; className?: string }) {
  return <picture>
    {mobileAvif && <source media="(max-width: 639px)" type="image/avif" srcSet={mobileAvif} />}
    {mobileWebp && <source media="(max-width: 639px)" type="image/webp" srcSet={mobileWebp} />}
    <source type="image/avif" srcSet={avif} />
    <source type="image/webp" srcSet={webp} />
    <img src={webp} alt={alt} width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} className={`block h-auto w-full ${className}`} />
  </picture>;
}

function ProductProofSection({ eyebrow, title, copy, bullets, reverse = false, children }: { eyebrow: string; title: string; copy: string; bullets: string[]; reverse?: boolean; children: React.ReactNode }) {
  return <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
    <div className={reverse ? "lg:order-2" : ""}>
      <SectionHeading eyebrow={eyebrow} title={title} copy={copy} />
      <ul className="mt-6 space-y-3 text-sm text-gray-700">{bullets.map((item) => <li key={item} className="flex gap-3"><CheckCircle className="mt-0.5 h-5 w-5 flex-none text-primary-600" aria-hidden="true" /><span>{item}</span></li>)}</ul>
    </div>
    <div className={reverse ? "lg:order-1" : ""}>{children}</div>
  </div>;
}

function FramedVisual({ label, children }: { label: string; children: React.ReactNode }) {
  return <figure className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-900 p-2 shadow-xl">
    <figcaption className="px-2 py-1.5 text-xs font-medium text-gray-300">{label}</figcaption>
    <div className="overflow-hidden rounded-xl bg-white">{children}</div>
  </figure>;
}

function PhoneVisual({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[1.75rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl ${className}`}><div className="mx-auto my-1 h-1.5 w-12 rounded-full bg-gray-600" aria-hidden="true" /><div className="overflow-hidden rounded-[1.25rem] bg-white">{children}</div></div>;
}

function ConnectedOperationBridge() {
  const roles = [["Owner", "Runs the operation"], ["Worker", "Completes the work"], ["Client", "Experiences the service"]];
  return <section className="border-y border-primary-200 bg-primary-50 px-4 py-16 sm:px-6" aria-labelledby="connected-operation-heading">
    <div className="mx-auto max-w-5xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">One connected operation</p>
      <h2 id="connected-operation-heading" className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">One job. Three connected experiences. One source of truth.</h2>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">{roles.map(([role, outcome], index) => <li key={role} className="relative rounded-2xl border border-primary-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold text-primary-600">0{index + 1}</span><h3 className="mt-2 text-xl font-semibold text-gray-900">{role}</h3><p className="mt-1 text-sm text-gray-600">{outcome}</p>{index < roles.length - 1 && <ArrowRight className="absolute -right-7 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-primary-500 md:block" aria-hidden="true" />}</li>)}</ol>
    </div>
  </section>;
}

function SolutionCard({ icon: Icon, title, copy, items }: { icon: typeof Home; title: string; copy: string; items: string[] }) {
  return <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><Icon className="h-6 w-6" aria-hidden="true" /></span><h3 className="mt-5 text-xl font-semibold text-gray-900">{title}</h3><p className="mt-3 text-sm leading-6 text-gray-600">{copy}</p><ul className="mt-5 space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm text-gray-700"><CheckCircle className="mt-0.5 h-4 w-4 flex-none text-primary-600" aria-hidden="true" />{item}</li>)}</ul></article>;
}

function TrustItem({ icon: Icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) {
  return <div><Icon className="h-6 w-6 text-primary-700" aria-hidden="true" /><h3 className="mt-3 font-semibold text-gray-900">{title}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p></div>;
}

function FooterGroup({ title, links }: { title: string; links: string[][] }) {
  return <div><h2 className="text-sm font-semibold text-white">{title}</h2><ul className="mt-2 text-sm">{links.map(([label, href]) => <li key={label}>{href.startsWith("#") ? <a href={href} className="touch-target inline-flex items-center hover:text-white">{label}</a> : <Link href={href} className="touch-target inline-flex items-center hover:text-white">{label}</Link>}</li>)}</ul></div>;
}
