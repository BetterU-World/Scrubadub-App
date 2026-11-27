import { ConvexError, v, type Infer } from "convex/values";
import { miniSiteSectionEnabled } from "./miniSiteSections";

export const SITE_CONTENT_LIMITS = { services: 8, serviceName: 60, serviceText: 600, link: 512, quoteLabel: 48, quoteText: 240 } as const;
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok", "linkedin", "youtube"] as const;
export const REVIEW_PLATFORMS = ["google", "yelp", "bbb", "angi", "trustpilot"] as const;
const day = v.union(...WEEKDAYS.map((value) => v.literal(value)));
const platform = v.union(...[...SOCIAL_PLATFORMS, ...REVIEW_PLATFORMS].map((value) => v.literal(value)));
const profile = v.object({ platform, url: v.string() });
const hours = v.union(
  v.object({ day, status: v.literal("open"), opens: v.string(), closes: v.string() }),
  v.object({ day, status: v.literal("closed") }),
  v.object({ day, status: v.literal("appointment") }),
);
const serviceCopy = {
  description: v.optional(v.string()),
  included: v.optional(v.string()),
  excluded: v.optional(v.string()),
};
const quote = v.object({ label: v.optional(v.string()), text: v.optional(v.string()) });
export const miniSitePresentationValidator = v.object({
  serviceDetails: v.optional(v.array(v.object({ index: v.number(), name: v.string(), ...serviceCopy }))),
  hours: v.optional(v.array(hours)),
  socials: v.optional(v.array(profile)),
  externalReviewsEnabled: v.optional(v.boolean()),
  externalReviews: v.optional(v.array(profile)),
  quote: v.optional(quote),
});
export const publicMiniSitePresentationValidator = v.object({
  serviceDetails: v.optional(v.array(v.object({ index: v.number(), ...serviceCopy }))),
  hours: v.optional(v.array(hours)),
  socials: v.optional(v.array(profile)),
  externalReviews: v.optional(v.array(profile)),
  quote: v.optional(quote),
});
export type MiniSitePresentation = Infer<typeof miniSitePresentationValidator>;
export type PublicMiniSitePresentation = Infer<typeof publicMiniSitePresentationValidator>;
export type MiniSiteHours = Infer<typeof hours>;
export type MiniSiteProfile = Infer<typeof profile>;
type Platform = MiniSiteProfile["platform"];

const allowedProfiles: Record<Platform, (url: URL) => boolean> = {
  facebook: ({ hostname, pathname, searchParams }) => ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(hostname) &&
    (/^\/[a-z\d][a-z\d.]{2,}\/?$/i.test(pathname) && !/\.php\/?$/i.test(pathname) &&
      !/^\/(help|login|watch|share|marketplace|events|groups|reel|reels)\/?$/i.test(pathname) ||
      /^\/people\/[a-z\d-]+\/\d+\/?$/i.test(pathname) ||
      pathname === "/profile.php" && /^\d+$/.test(searchParams.get("id") ?? "")),
  instagram: ({ hostname, pathname }) => ["instagram.com", "www.instagram.com"].includes(hostname) &&
    /^\/[a-z\d._]{1,30}\/?$/i.test(pathname) && !/^\/(accounts|explore|direct|p|reel|reels|stories|tv)\/?$/i.test(pathname),
  tiktok: ({ hostname, pathname }) => ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(hostname) && /^\/@[a-z\d._]+\/?$/i.test(pathname),
  linkedin: ({ hostname, pathname }) => ["linkedin.com", "www.linkedin.com"].includes(hostname) && /^\/(company|in)\/[a-z\d_-]+\/?$/i.test(pathname),
  youtube: ({ hostname, pathname }) => ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(hostname) &&
    /^\/(?:@|(?:channel|c|user)\/)[a-z\d._-]+\/?$/i.test(pathname),
  google: ({ hostname, pathname, searchParams }) =>
    (hostname === "maps.app.goo.gl" && /^\/[a-z\d]+\/?$/i.test(pathname)) ||
    (hostname === "g.page" && /^\/(?:r\/)?[a-z\d_-]+\/?$/i.test(pathname)) ||
    (["google.com", "www.google.com", "maps.google.com"].includes(hostname) &&
      (/^\/maps\/place\/[^/]+/.test(pathname) || /^\/maps\/?$/.test(pathname) && /^\d+$/.test(searchParams.get("cid") ?? ""))),
  yelp: ({ hostname, pathname }) => ["yelp.com", "www.yelp.com", "m.yelp.com"].includes(hostname) && /^\/biz\/[a-z\d_-]+\/?$/i.test(pathname),
  bbb: ({ hostname, pathname }) => ["bbb.org", "www.bbb.org"].includes(hostname) &&
    /^\/[a-z]{2}\/[a-z]{2}\/[a-z\d-]+\/profile\/[a-z\d-]+\/[a-z\d-]+(?:\/customer-reviews)?\/?$/i.test(pathname),
  angi: ({ hostname, pathname }) => ["angi.com", "www.angi.com"].includes(hostname) &&
    /^\/companylist\/(?:[a-z\d-]+\/)*(?:[a-z\d_-]+-)?reviews-\d+\.htm$/i.test(pathname),
  trustpilot: ({ hostname, pathname }) => ["trustpilot.com", "www.trustpilot.com"].includes(hostname) && /^\/review\/[a-z\d.-]+\.[a-z]{2,}\/?$/i.test(pathname),
};

export function safeMiniSiteProfile(profile: MiniSiteProfile) {
  const input = profile.url.trim();
  if (!/^https:\/\//i.test(input) || profile.url.length > SITE_CONTENT_LIMITS.link || /[\s\\]/.test(input)) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && allowedProfiles[profile.platform](url)) {
      return { platform: profile.platform, url: url.href };
    }
  } catch {
    return undefined;
  }
}

export function validMiniSiteHours(value: MiniSiteHours) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return value.status !== "open" || time.test(value.opens) && time.test(value.closes) && value.opens < value.closes;
}

function contentText(value: string | undefined, limit: number) {
  return value?.trim() && value.length <= limit ? value : undefined;
}

export function validateMiniSitePresentation(value: MiniSitePresentation, services: string[]) {
  const fail = (field: "services" | "hours" | "socials" | "externalReviews" | "quote") => {
    throw new ConvexError({ code: "INVALID_MINI_SITE_PRESENTATION", field });
  };
  const details = value.serviceDetails ?? [];
  if (details.length > SITE_CONTENT_LIMITS.services || new Set(details.map(({ index }) => index)).size !== details.length ||
    details.some(({ index, name, description, included, excluded }) =>
      !Number.isInteger(index) || !name || services[index] !== name ||
      [description, included, excluded].some((text) => (text?.length ?? 0) > SITE_CONTENT_LIMITS.serviceText))) fail("services");
  const schedule = value.hours ?? [];
  if (schedule.length > WEEKDAYS.length || new Set(schedule.map(({ day }) => day)).size !== schedule.length ||
    schedule.some((entry) => !validMiniSiteHours(entry))) fail("hours");
  for (const [field, platforms] of [["socials", SOCIAL_PLATFORMS], ["externalReviews", REVIEW_PLATFORMS]] as const) {
    const profiles = value[field] ?? [];
    if (profiles.length > platforms.length || new Set(profiles.map(({ platform }) => platform)).size !== profiles.length ||
      profiles.some((entry) => !(platforms as readonly Platform[]).includes(entry.platform) || !safeMiniSiteProfile(entry))) fail(field);
  }
  if ((value.quote?.label?.length ?? 0) > SITE_CONTENT_LIMITS.quoteLabel ||
    (value.quote?.text?.length ?? 0) > SITE_CONTENT_LIMITS.quoteText) fail("quote");
  return value;
}

export function publicMiniSitePresentation(
  value: MiniSitePresentation | undefined,
  services: string[],
  sections: Parameters<typeof miniSiteSectionEnabled>[0],
): PublicMiniSitePresentation {
  if (!value) return {};
  const result: PublicMiniSitePresentation = {};
  if (miniSiteSectionEnabled(sections, "services")) {
    const details = value.serviceDetails?.flatMap(({ index, name, description, included, excluded }) => {
      if (!Number.isInteger(index) || services[index] !== name) return [];
      const copy = {
        description: contentText(description, SITE_CONTENT_LIMITS.serviceText),
        included: contentText(included, SITE_CONTENT_LIMITS.serviceText),
        excluded: contentText(excluded, SITE_CONTENT_LIMITS.serviceText),
      };
      return Object.values(copy).some(Boolean) ? [{ index, ...copy }] : [];
    });
    if (details?.length) result.serviceDetails = details;
  }
  if (miniSiteSectionEnabled(sections, "businessHours")) {
    const schedule = WEEKDAYS.flatMap((day) => {
      const entry = value.hours?.find((item) => item.day === day);
      return entry && validMiniSiteHours(entry) ? [entry] : [];
    });
    if (schedule.length) result.hours = schedule;
  }
  const profiles = (items: MiniSiteProfile[] | undefined, platforms: readonly Platform[]) =>
    platforms.flatMap((platform) => {
      const item = items?.find((entry) => entry.platform === platform);
      const safe = item && safeMiniSiteProfile(item);
      return safe ? [safe] : [];
    });
  if (miniSiteSectionEnabled(sections, "socialProfiles")) {
    const socials = profiles(value.socials, SOCIAL_PLATFORMS);
    if (socials.length) result.socials = socials;
  }
  if (value.externalReviewsEnabled && miniSiteSectionEnabled(sections, "reviews")) {
    const reviews = profiles(value.externalReviews, REVIEW_PLATFORMS);
    if (reviews.length) result.externalReviews = reviews;
  }
  const label = contentText(value.quote?.label, SITE_CONTENT_LIMITS.quoteLabel);
  const text = contentText(value.quote?.text, SITE_CONTENT_LIMITS.quoteText);
  if (label || text) result.quote = { label, text };
  return result;
}
