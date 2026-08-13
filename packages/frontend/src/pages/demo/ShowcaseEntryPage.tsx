import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

const personas = [
  {
    title: "Owner",
    eyebrow: "Run the business",
    icon: BriefcaseBusiness,
    href: "/internal/demo/owner",
    copy: "See how properties, clients, requests, jobs, scheduling, teams, commercial accounts, and financial visibility connect.",
    features: [
      "Operations and scheduling",
      "Clients and service requests",
      "Team and business visibility",
    ],
  },
  {
    title: "Worker",
    eyebrow: "Do the work",
    icon: UsersRound,
    href: "/internal/demo/worker",
    copy: "Follow assignments from schedule to property instructions, checklists, photos, availability, and payments.",
    features: [
      "Assigned work and schedule",
      "Job instructions and checklists",
      "Availability and payments",
    ],
  },
  {
    title: "Client",
    eyebrow: "Experience the service",
    icon: UserRound,
    href: "/internal/demo/client",
    copy: "Explore upcoming services, request progress, documents, billing, service locations, and the client account experience.",
    features: [
      "Request and track service",
      "Documents and billing",
      "Locations and account",
    ],
  },
] as const;

export function ShowcaseEntryPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="" className="h-8 w-8" />
            <img src="/logo-word.png" alt="SCRUB" className="h-7 w-auto" />
          </a>
          <a
            href="/"
            className="touch-target inline-flex items-center text-sm font-medium text-gray-600 hover:text-primary-700"
          >
            Back to SCRUB
          </a>
        </div>
      </header>
      <main>
        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">
                <Sparkles className="h-4 w-4" />
                SCRUB Showcase
              </p>
              <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
                Choose how you want to experience SCRUB.
              </h1>
              <p className="mt-5 text-lg leading-8 text-gray-600">
                Step into a connected cleaning-business workspace and explore
                the product from the perspective that matters to you.
              </p>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {personas.map(
                ({ title, eyebrow, icon: Icon, href, copy, features }) => (
                  <a
                    key={title}
                    href={href}
                    className="group flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <Icon className="h-7 w-7 text-primary-600" />
                    <p className="mt-5 text-sm font-semibold uppercase tracking-[.14em] text-primary-700">
                      {eyebrow}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      {copy}
                    </p>
                    <ul className="mt-5 space-y-2">
                      {features.map((feature) => (
                        <li
                          key={feature}
                          className="flex gap-2 text-sm text-gray-700"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-green-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <span className="mt-6 inline-flex items-center gap-2 font-semibold text-primary-700">
                      Explore as {title}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </a>
                ),
              )}
            </div>
            <section className="mt-10 rounded-2xl border border-primary-100 bg-primary-50 p-5 sm:p-6">
              <h2 className="font-semibold text-primary-950">
                A transparent look before you create an account
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-primary-900/80">
                SCRUB Showcase is a fictional, representative workspace with no
                real customer or company information. It lets you explore how
                SCRUB works before signing up. Some actions are intentionally
                unavailable, and the experience will keep growing alongside the
                product.
              </p>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
