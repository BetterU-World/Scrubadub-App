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
  eligibility: string;
  entryMethod: string;
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
    enabled: false,
    rulesApproved: false,
    name: "SCRUB Cleaning Owner Giveaway",
    eyebrow: "For cleaning-business owners",
    headline: "Take the SCRUB Cleaning Business Assessment for a chance to win $100.",
    description: "Get a clearer picture of how your cleaning business operates, plus a chance to win a prize for taking the time to reflect.",
    prize: { title: "$100 Digital Visa Gift Card", description: "One winner. One digital gift card, delivered by email.", arv: "$100 USD" },
    startsAt: null, // OWNER: set an explicit ISO timestamp with offset before launch.
    endsAt: Date.parse("2026-10-31T00:00:00-04:00"),
    timezone: "America/New_York",
    deadlineLabel: "October 30, 2026 at 11:59 PM ET",
    eligibility: "U.S. cleaning-business owners/operators, age 18 or older, subject to the Official Rules. Void where prohibited.",
    entryMethod: "Complete the free SCRUB Cleaning Business Assessment during the promotion period and provide a valid contact email. One qualifying entry per person/email address.",
    ctaLabel: "Take the assessment to enter",
    ctaDestination: "/assessment",
    endedMessage: "Entries are closed. Thank you to everyone who participated. The winner will be contacted by email.",
    rulesVersion: "scrub-giveaway-2026-001-draft-v1",
    rules: [
      { title: "Sponsor", body: "SCRUB (powered by Scrubadub Solutions). Owner review required: confirm the sponsor’s full legal identity and mailing address before launch." },
      { title: "Eligibility", body: "Open to U.S. cleaning-business owners/operators who are at least 18 years old, subject to the final Official Rules. Void where prohibited. Owner/legal review required for state-specific eligibility and any employee or household restrictions; no additional exclusions have been assumed." },
      { title: "How to enter", body: "During the promotion period, complete the SCRUB Cleaning Business Assessment through the giveaway entry link and provide a valid email where we can contact you if selected. One qualifying entry per person/email address. Repeating the assessment does not create additional entries. Eligibility is subject to verification." },
      { title: "No purchase necessary", body: "A purchase does not increase your chances of winning. No SCRUB account, subscription, payment information, trial, social-media follow, post, or share is required." },
      { title: "Selection and odds", body: "After entries close, a winner will be selected randomly from eligible unique entries. Assessment answers and scores never affect eligibility or odds. Odds depend on the number of eligible entries received." },
      { title: "Notification and alternates", body: "The selected entrant will be contacted at the email supplied with the assessment and has 72 hours to respond. If the entrant cannot be contacted, does not respond within 72 hours, or is ineligible, an alternate may be randomly selected from the remaining eligible entries." },
      { title: "Privacy and email consent", body: "We use your contact email, campaign attribution, assessment completion reference, and entry timestamp to administer the giveaway, check duplicate entries, and contact the selected entrant. Marketing email consent is separate, optional, and never a condition of entry. We do not publicly disclose the winner’s full name, email, business, assessment results, or other personal information without explicit permission. See the SCRUB Privacy Policy." },
      { title: "Terms requiring review before launch", body: "Owner/legal review required: confirm prize issuer terms, delivery timing, taxes, data retention, release and liability limitations, and applicable dispute provisions. Existing SCRUB Terms reference Florida law; applicability to this promotion must be reviewed. Confirm whether platform disclaimers are needed for the channels used to promote this campaign. This draft is not final legal advice." },
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
