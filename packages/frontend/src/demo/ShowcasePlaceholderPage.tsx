import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { DemoShell } from "./DemoShell";
import {
  buildShowcasePath,
  getShowcasePage,
  type ShowcasePageDefinition,
} from "./showcaseRegistry";

interface ShowcasePlaceholderPageProps {
  page: ShowcasePageDefinition;
  currentPath: string;
  presentation: boolean;
}

export function ShowcasePlaceholderPage({
  page,
  currentPath,
  presentation,
}: ShowcasePlaceholderPageProps) {
  const { t } = useTranslation();
  const personaName = page.persona === "owner" ? "Owner" : "Worker";
  const home = getShowcasePage(page.persona as "owner" | "worker", "/")!;
  const homePath = buildShowcasePath(page.persona, "/", presentation);

  return (
    <DemoShell
      persona={page.persona as "owner" | "worker"}
      presentation={presentation}
      currentPath={currentPath}
    >
      <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-700">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            SCRUB Showcase
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            {personaName} experience
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
            {t(page.labelKey)}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
            This workspace is not included in SCRUB Showcase yet. {page.description}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            In the full SCRUB product
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {page.capabilities?.map((capability) => (
              <li key={capability} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-primary-600" />
                <span>{capability}</span>
              </li>
            ))}
          </ul>

          <Link
            href={homePath}
            className="mt-8 inline-flex items-center gap-2 rounded-lg font-semibold text-primary-700 outline-none ring-primary-500 transition hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-offset-4"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Return to {personaName} {t(home.labelKey)}
          </Link>
        </div>
      </article>
    </DemoShell>
  );
}
