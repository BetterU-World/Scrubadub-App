import { ConvexError, v, type Infer } from "convex/values";

// Registry order also defines where new section types appear on older sites.
export const MINI_SITE_SECTIONS = {
  services: { enabled: true, entryBodyLimit: 0 },
  addOns: { enabled: true, entryBodyLimit: 0 },
  howItWorks: { enabled: false, entryBodyLimit: 600 },
  serviceArea: { enabled: true, entryBodyLimit: 0 },
  reviews: { enabled: true, entryBodyLimit: 0 },
  highlights: { enabled: false, entryBodyLimit: 320 },
  faq: { enabled: false, entryBodyLimit: 1200 },
  businessHours: { enabled: false, entryBodyLimit: 0 },
  socialProfiles: { enabled: false, entryBodyLimit: 0 },
  policies: { enabled: false, entryBodyLimit: 1200 },
  gallery: { enabled: false, entryBodyLimit: 0 },
  team: { enabled: false, entryBodyLimit: 0 },
  resources: { enabled: false, entryBodyLimit: 0 },
} as const;

export type MiniSiteSectionId = keyof typeof MINI_SITE_SECTIONS;
const sectionIds = Object.keys(MINI_SITE_SECTIONS) as MiniSiteSectionId[];
const publicSectionId = v.union(...sectionIds.map((id) => v.literal(id)));

export function miniSiteSectionHeadingKey(id: MiniSiteSectionId) {
  return id === "addOns" ? "publicSite.addOns.title" : `publicSite.sections.${id}`;
}

export const HIGHLIGHT_ICONS = [
  "shield", "check", "sparkles", "leaf", "clock", "calendar",
  "heart", "home", "users", "award", "star", "handshake",
] as const;
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];

export const SECTION_LIMITS = { entries: 12, heading: 80, title: 160 } as const;
const ENTRY_ID = /^[a-zA-Z0-9_-]{1,64}$/;

// Stored IDs are strings so retired types and icon values can be read safely.
// Writes are checked against the registry; array position defines order.
export const miniSiteSectionsValidator = v.array(v.object({
  id: v.string(),
  enabled: v.boolean(),
  heading: v.optional(v.string()),
  entries: v.optional(v.array(v.object({
    id: v.string(),
    enabled: v.boolean(),
    title: v.string(),
    body: v.string(),
    icon: v.optional(v.string()),
  }))),
}));

type StoredSections = Infer<typeof miniSiteSectionsValidator>;
export type MiniSiteSectionEntry = NonNullable<StoredSections[number]["entries"]>[number];
export type MiniSiteSection = StoredSections[number] & { id: MiniSiteSectionId };

function supportedSection(id: string): id is MiniSiteSectionId {
  return Object.prototype.hasOwnProperty.call(MINI_SITE_SECTIONS, id);
}

export function supportedHighlightIcon(icon?: string): icon is HighlightIcon {
  return HIGHLIGHT_ICONS.some((value) => value === icon);
}

export function resolveMiniSiteSections(saved: StoredSections | undefined): MiniSiteSection[] {
  const sections = new Map<MiniSiteSectionId, MiniSiteSection>();
  for (const section of saved ?? []) {
    const { id } = section;
    if (!supportedSection(id) || sections.has(id)) continue;
    sections.set(id, {
      ...section,
      id,
      entries: MINI_SITE_SECTIONS[id].entryBodyLimit
        ? section.entries?.map(({ icon, ...entry }) => ({
          ...entry,
          ...(id === "highlights" && supportedHighlightIcon(icon) ? { icon } : {}),
        })) ?? (id === "howItWorks" ? undefined : [])
        : undefined,
    });
  }
  for (const id of sectionIds) {
    if (sections.has(id)) continue;
    // The missing field identifies pre-Phase 1 sites. New sites store [].
    const legacyProcess = saved === undefined && id === "howItWorks";
    sections.set(id, {
      id,
      enabled: legacyProcess || MINI_SITE_SECTIONS[id].enabled,
      entries: MINI_SITE_SECTIONS[id].entryBodyLimit && !legacyProcess ? [] : undefined,
    });
  }
  return [...sections.values()];
}

export function validateMiniSiteSections(sections: StoredSections, previous: StoredSections | undefined) {
  const invalid = () => new ConvexError({ code: "INVALID_MINI_SITE_SECTIONS" as const });
  if (sections.length > sectionIds.length) throw invalid();
  const seen = new Set<string>();
  const legacyProcess = resolveMiniSiteSections(previous).find(({ id }) => id === "howItWorks")?.entries === undefined;
  for (const { id, heading, entries } of sections) {
    if (!supportedSection(id) || seen.has(id) || (heading?.length ?? 0) > SECTION_LIMITS.heading) throw invalid();
    seen.add(id);
    const bodyLimit = MINI_SITE_SECTIONS[id].entryBodyLimit;
    if (!bodyLimit && entries !== undefined) throw invalid();
    if (entries === undefined) {
      if (id === "howItWorks" && !legacyProcess) throw invalid();
      continue;
    }
    if (entries.length > SECTION_LIMITS.entries) throw invalid();
    const entryIds = new Set<string>();
    for (const entry of entries) {
      if (!ENTRY_ID.test(entry.id) || entryIds.has(entry.id) ||
        entry.title.length > SECTION_LIMITS.title || entry.body.length > bodyLimit ||
        (entry.icon !== undefined && (id !== "highlights" || !supportedHighlightIcon(entry.icon)))) throw invalid();
      entryIds.add(entry.id);
    }
  }
  return sections;
}

export function miniSiteSectionEnabled(saved: StoredSections | undefined, id: MiniSiteSectionId) {
  return saved?.find((section) => section.id === id)?.enabled ?? MINI_SITE_SECTIONS[id].enabled;
}

export const publicMiniSiteSectionsValidator = v.array(v.object({
  id: publicSectionId,
  heading: v.optional(v.string()),
  legacyProcess: v.optional(v.literal(true)),
  entries: v.optional(v.array(v.object({
    title: v.string(),
    body: v.string(),
    icon: v.optional(v.string()),
  }))),
}));
export type PublicMiniSiteSections = Infer<typeof publicMiniSiteSectionsValidator>;

export function publicMiniSiteSections(saved: StoredSections | undefined): PublicMiniSiteSections {
  return resolveMiniSiteSections(saved).flatMap(({ id, enabled, heading, entries }): PublicMiniSiteSections => {
    if (!enabled) return [];
    const section = { id, ...(heading?.trim() && heading.length <= SECTION_LIMITS.heading ? { heading } : {}) };
    const bodyLimit = MINI_SITE_SECTIONS[id].entryBodyLimit;
    if (!bodyLimit) return [section];
    if (id === "howItWorks" && entries === undefined) return [{ ...section, legacyProcess: true }];
    const content = (entries ?? []).slice(0, SECTION_LIMITS.entries)
      .filter(({ enabled, title, body }) => enabled && title.trim() && body.trim() &&
        title.length <= SECTION_LIMITS.title && body.length <= bodyLimit)
      .map(({ title, body, icon }) => ({ title, body, ...(icon ? { icon } : {}) }));
    return content.length ? [{ ...section, entries: content }] : [];
  });
}
