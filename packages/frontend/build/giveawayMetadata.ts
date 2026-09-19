import { currentGiveawayId, giveawayCampaigns } from "../../../convex/lib/giveawayCampaigns";

/** Social crawlers usually do not run React; emit only this route's HTML head. */
export function giveawayHtml(html: string) {
  const campaign = giveawayCampaigns[currentGiveawayId];
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const title = escape(`${campaign.name} | SCRUB`);
  const description = escape(campaign.headline);
  return html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
    .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")/g, (_match, prefix, suffix) => `${prefix}${description}${suffix}`)
    .replace(/(<meta (?:name|property)="(?:og:title|twitter:title)" content=")[^"]*(")/g, (_match, prefix, suffix) => `${prefix}${title}${suffix}`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, '$1https://scrubscrubscrub.com/giveaway$2')
    .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1https://scrubscrubscrub.com/giveaway$2');
}
