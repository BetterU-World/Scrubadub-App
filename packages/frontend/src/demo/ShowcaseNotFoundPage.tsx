import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "wouter";
import { DemoShell } from "./DemoShell";
import { buildShowcasePath } from "./showcaseRegistry";
import type { DemoPersona } from "./demoRoute";

export function ShowcaseNotFoundPage({
  persona,
  currentPath,
  presentation,
}: {
  persona: DemoPersona;
  currentPath: string;
  presentation: boolean;
}) {
  const personaName = persona === "owner" ? "Owner" : "Worker";

  return (
    <DemoShell persona={persona} presentation={presentation} currentPath={currentPath}>
      <article className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10">
        <Compass aria-hidden="true" className="mx-auto h-10 w-10 text-primary-600" />
        <p className="mt-5 text-sm font-semibold text-primary-700">SCRUB Showcase</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Showcase page not found</h1>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-gray-600">
          This address is not part of the {personaName} Showcase experience. You are still safely inside SCRUB Showcase.
        </p>
        <Link
          href={buildShowcasePath(persona, "/", presentation)}
          className="mt-7 inline-flex items-center gap-2 rounded-lg font-semibold text-primary-700 outline-none ring-primary-500 hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-offset-4"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Return to {personaName} {persona === "owner" ? "Overview" : "Home"}
        </Link>
      </article>
    </DemoShell>
  );
}
