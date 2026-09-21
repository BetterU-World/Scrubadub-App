import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { Gift, ArrowRight, CheckCircle2 } from "lucide-react";
import { currentGiveawayId, giveawayCampaigns, giveawayState, giveawayAssessmentUrl, type GiveawayCampaign } from "../../../../../convex/lib/giveawayCampaigns";
import { isOperationsAssessmentEnabled } from "../../lib/assessmentFeature";
import { GiveawayAlternateEntry } from "./GiveawayAlternateEntry";

export function useGiveawayState(campaign: GiveawayCampaign) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  return giveawayState(campaign, now);
}

function useGiveawayMeta(campaign: GiveawayCampaign) {
  useEffect(() => {
    const previousTitle = document.title;
    const previousLang = document.documentElement.lang;
    document.documentElement.lang = "en";
    document.title = `${campaign.name} | SCRUB`;
    const restores: (() => void)[] = [];
    const tags = [
      ["name", "description", campaign.headline],
      ["property", "og:title", document.title], ["property", "og:description", campaign.headline],
      ["property", "og:url", "https://scrubscrubscrub.com/giveaway"],
      ["name", "twitter:title", document.title], ["name", "twitter:description", campaign.headline],
    ];
    for (const [attribute, key, value] of tags) {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const element = existing ?? document.createElement("meta");
      const old = element.getAttribute("content");
      element.setAttribute(attribute, key); element.setAttribute("content", value);
      if (!existing) document.head.appendChild(element);
      restores.push(() => { if (!existing) element.remove(); else if (old !== null) element.setAttribute("content", old); else element.removeAttribute("content"); });
    }
    const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonical = existing ?? document.createElement("link");
    const oldHref = canonical.getAttribute("href");
    canonical.rel = "canonical"; canonical.href = "https://scrubscrubscrub.com/giveaway";
    if (!existing) document.head.appendChild(canonical);
    return () => {
      document.title = previousTitle; document.documentElement.lang = previousLang;
      restores.forEach(restore => restore());
      if (!existing) canonical.remove(); else if (oldHref !== null) canonical.setAttribute("href", oldHref);
    };
  }, [campaign]);
}

export function GiveawayPage() {
  const requested = new URLSearchParams(window.location.search).get("campaign");
  const campaign = requested && Object.prototype.hasOwnProperty.call(giveawayCampaigns, requested) ? giveawayCampaigns[requested] : giveawayCampaigns[currentGiveawayId];
  const state = useGiveawayState(campaign);
  const active = state === "active" && isOperationsAssessmentEnabled;
  useGiveawayMeta(campaign);
  useEffect(() => { track("giveaway_page_viewed", { campaignId: campaign.campaignId }); }, [campaign.campaignId]);
  const opening = campaign.startsAt === null ? "Opening date to be announced." : `Scheduled opening: ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: campaign.timezone }).format(campaign.startsAt)} ET.`;
  return <div lang="en" className="min-h-dvh bg-gray-50 text-gray-900 [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-primary-600">
    <header className="border-b border-gray-200 bg-white"><div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"><a href="/" className="flex min-h-11 items-center gap-2 font-bold"><img src="/logo-icon.png" alt="" className="h-8 w-8"/>SCRUB</a><a href="#official-rules" className="py-3 text-sm font-semibold text-primary-700">Official Rules</a></div></header>
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center" aria-labelledby="giveaway-title">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-primary-700">{campaign.eyebrow}</p><h1 id="giveaway-title" className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{campaign.headline}</h1><p className="mt-5 text-lg leading-8 text-gray-600">{campaign.description}</p>
          <div role="status" className="mt-6 rounded-2xl border border-primary-200 bg-primary-50 p-4 font-medium text-primary-900">
            {state === "upcoming" ? `This giveaway has not opened. ${opening} Neither entry method currently qualifies.` : state === "winner" ? campaign.winnerMessage : state === "ended" ? campaign.endedMessage : "Entries are open. Choose Assessment entry or free alternate entry; both have the same odds."}
          </div>
          <p className="mt-5 font-semibold">Ends <time dateTime={new Date(campaign.endsAt - 60_000).toISOString()}>{campaign.deadlineLabel}</time></p>
          {active ? <a className="btn-primary mt-6 flex w-full items-center justify-center gap-2 sm:inline-flex sm:w-auto" href={giveawayAssessmentUrl(campaign)} onClick={() => track("giveaway_assessment_cta_clicked", { campaignId: campaign.campaignId })}>{campaign.ctaLabel}<ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true"/></a> : isOperationsAssessmentEnabled && <div className="mt-6"><a href={campaign.ctaDestination} className="btn-secondary w-full sm:w-auto">Take the free assessment</a><p className="mt-3 text-sm text-gray-600">Completing it now does not enter this giveaway.</p></div>}
          <p className="mt-4 leading-7 text-gray-600">{campaign.entryDisclosure} <a href="#alternate-entry" className="font-semibold text-primary-700 underline">Free alternate entry</a> · <a href="#official-rules" className="font-medium text-primary-700 underline">Official Rules</a></p>
        </div>
        <aside className="rounded-3xl border border-primary-100 bg-white p-7 shadow-sm sm:p-10"><Gift className="h-12 w-12 text-primary-600" aria-hidden="true"/><p className="mt-6 text-sm font-semibold uppercase tracking-widest text-primary-700">The prize</p><h2 className="mt-3 text-3xl font-bold">{campaign.prize.title}</h2><p className="mt-4 leading-7 text-gray-600">{campaign.prize.description}</p><p className="mt-3 text-sm text-gray-500">Approximate retail value: {campaign.prize.arv}</p>{campaign.sponsor && <div className="mt-6 border-t pt-5">{campaign.sponsor.logo && <img src={campaign.sponsor.logo} alt={campaign.sponsor.name} className="mb-3 h-12 max-w-full object-contain"/>}<p>{campaign.sponsor.disclosure}</p>{campaign.sponsor.url && <a href={campaign.sponsor.url} rel="noopener noreferrer" className="text-primary-700 underline">{campaign.sponsor.name}</a>}</div>}</aside>
      </section>
      <section className="mt-14 rounded-3xl border border-gray-200 bg-white p-6 sm:p-10"><h2 className="text-2xl font-bold">How to enter</h2><p className="mt-4 leading-7 text-gray-600">{campaign.entryMethod}</p><h3 className="mt-6 text-lg font-semibold">Method A — Assessment entry</h3><ol className="mt-4 grid gap-5 sm:grid-cols-3">{["Use the giveaway entry link while entries are open.", "Complete the existing SCRUB Cleaning Business Assessment.", "Provide your contact email so we can reach you if you win."].map((item, index) => <li key={item} className="rounded-2xl bg-gray-50 p-5"><span className="font-bold text-primary-700">0{index + 1}</span><p className="mt-3 leading-7">{item}</p></li>)}</ol><p className="mt-5 text-sm leading-6 text-gray-600">No account, subscription, payment information, trial, follow, post, or share required. Repeating the assessment or using both methods does not add entries.</p><h3 className="mt-6 text-lg font-semibold">Method B — free alternate entry</h3><p className="mt-3 leading-7 text-gray-600">Assessment completion is not required to enter. Use the short alternate form during the same promotion period for the same chance of winning.</p><a href="#alternate-entry" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary-700 underline">Go to free alternate entry</a></section>
      <div className="mt-14 grid gap-10 sm:grid-cols-2"><section><h2 className="text-2xl font-bold">A clearer view of your business</h2><p className="mt-4 leading-7 text-gray-600">The free Cleaning Business Assessment helps you reflect on scheduling, team coordination, quality, clients, finances, and growth. Get your operations score, a practical diagnosis, and a roadmap for what to improve next.</p><p className="mt-4 flex items-start gap-2 font-medium text-primary-800"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" aria-hidden="true"/>Your answers and score never affect your odds.</p></section><section><h2 className="text-2xl font-bold">Who can enter</h2><p className="mt-4 leading-7 text-gray-600">{campaign.eligibility}</p><p className="mt-4 leading-7 text-gray-600">Drawing: {campaign.drawingLabel}. The winner is selected randomly from eligible unique entries from both methods and contacted by email, with 72 hours to respond. Odds depend on the number of eligible unique entries.</p></section></div>
      <GiveawayAlternateEntry key={campaign.campaignId} campaign={campaign} active={state === "active"} />
      <section id="official-rules" className="mt-14 scroll-mt-6 rounded-3xl border border-gray-200 bg-white p-6 sm:p-10" aria-labelledby="rules-title"><h2 id="rules-title" className="text-2xl font-bold">Official Rules — {campaign.name}</h2>{!campaign.rulesApproved && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">Draft — owner/legal review required before launch. Entries are not open.</p>}<h3 className="mt-6 text-lg font-semibold">Promotion period and prize</h3><p className="mt-2 leading-7 text-gray-600">{opening} Ends {campaign.deadlineLabel}. One {campaign.prize.title}. Approximate retail value: {campaign.prize.arv}. Drawing: {campaign.drawingLabel}.</p>{campaign.rules.map(rule => <div key={rule.title} className="mt-6"><h3 className="text-lg font-semibold">{rule.title}</h3><p className="mt-2 whitespace-pre-line leading-7 text-gray-600">{rule.body}</p></div>)}<p className="mt-6"><a href="/privacy" className="font-medium text-primary-700 underline">Privacy Policy</a> · <a href="/terms" className="font-medium text-primary-700 underline">Terms of Service</a></p></section>
    </main><footer className="border-t border-gray-200 px-4 py-8 text-center text-sm text-gray-600">SCRUB · Built for cleaning businesses. <a href="/privacy" className="underline">Privacy Policy</a></footer>
  </div>;
}
