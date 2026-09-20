/** Public content and server eligibility share this registry. Retain old campaigns/rules. */
export interface GiveawayCampaign {
  campaignId: string;
  enabled: boolean;
  rulesApproved: boolean;
  name: string;
  eyebrow: string;
  headline: string;
  description: string;
  prize: { title: string; description: string; arv: string };
  startsAt: number | null;
  /** Exclusive boundary: the entire displayed 11:59 PM minute is included. */
  endsAt: number;
  timezone: string;
  deadlineLabel: string;
  drawingLabel: string;
  eligibility: string;
  entryMethod: string;
  entryDisclosure: string;
  ctaLabel: string;
  ctaDestination: string;
  endedMessage: string;
  winnerMessage?: string;
  winnerPublicityApproved?: boolean;
  sponsor?: { name: string; logo?: string; url?: string; disclosure: string };
  rulesVersion: string;
  rules: { title: string; body: string }[];
}

export const currentGiveawayId = "scrub-giveaway-2026-001";
export const giveawayCampaigns: Record<string, GiveawayCampaign> = {
  [currentGiveawayId]: {
    campaignId: currentGiveawayId,
    enabled: true,
    rulesApproved: true,
    name: "SCRUB Cleaning Owner Giveaway",
    eyebrow: "For cleaning-business owners",
    headline: "Take the SCRUB Cleaning Business Assessment for a chance to win $100.",
    description: "Get a clearer picture of how your cleaning business operates, plus a chance to win a prize for taking the time to reflect.",
    prize: { title: "$100 Digital Visa Gift Card", description: "One winner. One digital gift card, delivered by email.", arv: "$100 USD" },
    startsAt: Date.parse("2026-09-21T00:00:00-04:00"),
    endsAt: Date.parse("2026-10-31T00:00:00-04:00"),
    timezone: "America/New_York",
    deadlineLabel: "October 30, 2026 at 11:59 PM ET",
    drawingLabel: "On or about November 2, 2026",
    eligibility: "Legal residents of the 50 United States and District of Columbia, age 18 or older at entry, who currently own or operate a qualifying cleaning-services business. Sole proprietors may qualify; an LLC, corporation, EIN, website, employees, or business license is not inherently required by this campaign. Automotive-detailing-only and car-wash-only businesses are not eligible. Subject to the insider exclusion and other Official Rules. Void where prohibited.",
    entryMethod: "During the promotion period, either complete the free SCRUB Cleaning Business Assessment and provide a valid contact email, or use the free alternate online entry form. Confirm your eligibility and agree to the Official Rules. Both methods receive the same chance of winning.",
    entryDisclosure: "No purchase necessary. Assessment completion is not required to enter. A free alternate entry method is available. Limit one entry per person/email regardless of entry method. Neither a purchase nor Assessment completion improves your odds.",
    ctaLabel: "Take the assessment to enter",
    ctaDestination: "/assessment",
    endedMessage: "Entries are closed. Thank you to everyone who participated. The winner will be contacted by email.",
    sponsor: { name: "Scrubadub Solutions LLC", disclosure: "Sponsored and operated by Scrubadub Solutions LLC, operator of SCRUB." },
    rulesVersion: "scrub-giveaway-2026-001-rules-v1",
    rules: [
      { title: "Sponsor", body: "Scrubadub Solutions LLC, operator of SCRUB, is the Sponsor and operator of this Giveaway." },
      { title: "Eligibility", body: "Open to legal residents of the 50 United States and District of Columbia who are age 18 or older at the time of entry and currently own or operate a business providing qualifying professional cleaning services. Sole proprietors may qualify. A formal LLC, corporation, EIN, website, employees, or business license is not inherently required by this campaign definition. Qualifying services include residential cleaning, commercial cleaning, janitorial services, housekeeping, vacation-rental/short-term-rental cleaning, move-in/move-out cleaning, post-construction cleaning, carpet cleaning, upholstery cleaning, window cleaning, pressure washing, and other substantially similar professional cleaning services. Automotive-detailing-only and car-wash-only businesses are outside this campaign’s eligibility. Entrants attest to eligibility; the selected entrant’s eligibility may be verified before fulfillment. Eligibility is applied consistently across both methods and never depends on Assessment answers or score. Void where prohibited." },
      { title: "Insider exclusion", body: "Sponsor personnel directly involved in administering this Giveaway or selecting or validating the winner, their immediate family members, and members of their household are not eligible. This exclusion does not apply to other workers, cleaners, or contractors solely because they have worked with Sponsor." },
      { title: "Method A — Assessment entry", body: "During the promotion period, follow the Assessment entry link on this page, complete the SCRUB Cleaning Business Assessment, provide a valid contact email, and confirm eligibility and agreement to the Official Rules. Completion and qualification must occur before entries close. Assessment completion is one entry method, not a requirement for Method B." },
      { title: "Method B — free alternate online entry", body: "During the same promotion period, use the Free alternate entry form on this page. Provide first name, last name, and a valid email, attest to eligibility, and acknowledge the Official Rules. No Assessment, SCRUB account, trial, subscription, payment information, purchase, social-media follow, post, share, or marketing consent is required. A valid alternate entry has the same chance of winning as a valid Assessment entry." },
      { title: "Entry limit and no purchase necessary", body: "Limit one (1) qualifying entry per person and per email address during the Promotion Period, regardless of entry method. Repeated submissions or using both methods do not add entries. One-person enforcement may be applied during eligibility verification. No purchase or payment is required to enter or to receive the prize. A purchase, Assessment completion, SCRUB account, trial, subscription, or marketing consent does not increase your chances of winning. There are no bonus entries, weights, or priorities for either method." },
      { title: "Prize", body: "One (1) $100 Digital Visa Gift Card, with an approximate retail value (ARV) of $100 USD. Subject to winner verification and compliance with these Official Rules, one (1) advertised prize will be awarded. No purchase or payment is required to receive the prize. Sponsor is responsible for delivery of the prize to the verified winner. The prize is subject to the terms and conditions applicable to the gift card at the time of issuance. Any taxes or other obligations arising from acceptance or use of the prize are the winner's responsibility to the extent required by applicable law. Visa does not sponsor, endorse, administer, or have an affiliation with this Giveaway." },
      { title: "Selection and odds", body: "A winner will be selected randomly on or about November 2, 2026 from one combined pool of eligible unique entries received through both methods. Each eligible unique entry receives the same chance. Assessment completion, answers or score, entry method, marketing consent, and SCRUB account or subscription status never provide priority or affect odds. Odds depend on the number of eligible unique entries received." },
      { title: "Notification, verification and alternates", body: "The selected entrant will be contacted at the email supplied with their entry and has 72 hours from notification to respond. Eligibility may be verified before prize fulfillment, independently of Assessment answers or score. If the entrant cannot be contacted, does not respond within 72 hours, or is ineligible, an alternate may be randomly selected from the remaining eligible entries with equal treatment of both methods." },
      { title: "Privacy and email consent", body: "We use entry information (including names for alternate entries, contact email, entry method, campaign, entry timestamp, eligibility/rules confirmation, and Assessment reference when applicable) to administer the promotion, check duplicates, verify eligibility, contact the selected winner, and fulfill the prize. Marketing email consent is separate, optional, and never a condition of entry or a factor in winner selection. Neither method automatically subscribes an entrant to marketing. We do not publicly disclose names, emails, businesses, Assessment results, or other identifying winner information without appropriate explicit permission. See the SCRUB Privacy Policy." },
    ],
  },
};

export function giveawayState(campaign: GiveawayCampaign, now: number): "upcoming" | "active" | "ended" | "winner" {
  if (now >= campaign.endsAt) return campaign.winnerMessage && campaign.winnerPublicityApproved ? "winner" : "ended";
  if (!campaign.enabled || !campaign.rulesApproved || campaign.startsAt === null || !Number.isFinite(campaign.startsAt) || campaign.startsAt >= campaign.endsAt || now < campaign.startsAt) return "upcoming";
  return "active";
}

export function giveawayAssessmentUrl(campaign: GiveawayCampaign) {
  const url = new URL(campaign.ctaDestination, "https://scrubscrubscrub.com");
  url.searchParams.set("campaign", campaign.campaignId);
  return `${url.pathname}${url.search}`;
}

export function normalizeGiveawayEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Enter a valid email address");
  return normalized;
}
