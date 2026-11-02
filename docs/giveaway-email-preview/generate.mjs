// Offline review artifacts only. No recipient data, credentials, network, or delivery SDK.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const disclosure = 'Get your first month of SCRUB free with code FIRST50. Valid on all subscription plans. A payment method is required. Your subscription automatically renews at the regular price of your selected plan after the first month unless canceled.';
export const emails = [
  {
    id: 'winner', label: 'A · Official winner notification',
    subject: "Congratulations! You're the SCRUB Giveaway Winner",
    preheader: 'Your $100 Digital Visa Gift Card is scheduled for Friday, November 6, 2026.',
    eyebrow: 'THE SCRUB GIVEAWAY', title: 'A little celebration.<br>A well-earned thank-you.',
    paragraphs: [
      'Hello,',
      'Congratulations! You were selected as the winner of the SCRUB Cleaning Owner Giveaway. Your prize is a $100 Digital Visa Gift Card.',
      'Please reply to this email within 72 hours of receiving this notification to confirm that you would like to claim your prize. We may verify your eligibility before fulfillment, as described in the Official Rules. No purchase or payment is required to receive your prize.',
      'Your gift card is scheduled for electronic delivery on Friday, November 6, 2026, subject to eligibility verification and compliance with the Official Rules.',
      'Thank you for taking the time to participate and share in the SCRUB community.',
    ],
    boxTitle: 'Your prize', box: '$100 Digital Visa Gift Card<br>Scheduled electronic delivery · November 6, 2026',
    extra: '<h2 style="font-size:20px;color:#064e3b;margin:28px 0 12px">A separate, optional thank-you</h2><p>We would also like to offer you three complimentary months of SCRUB. If you are interested, let us know in your reply and we will share the activation details separately. Accepting this bonus is optional and has no effect on your gift card prize.</p>',
    footer: 'Please reply to claim your prize. No account, subscription, purchase, or bonus acceptance is required.',
    note: 'Reply-to mailbox, private winner-entry match, verification status, notification timestamp, and bonus activation terms require review. Add assessment-specific thanks only after confirming the winner entered through that method.',
  },
  {
    id: 'results', label: 'B · Neutral results notification', subject: 'SCRUB Giveaway Results',
    preheader: 'Thank you for participating. The giveaway winner has been selected.',
    eyebrow: 'GIVEAWAY UPDATE', title: 'Thank you for<br>being part of it.',
    paragraphs: ['Hello,', 'Thank you for participating in the SCRUB Cleaning Owner Giveaway. The drawing is complete, and the winner has been selected.', 'You were not selected in this drawing. We appreciate the time you took to enter.', 'If you completed the SCRUB Cleaning Business Assessment, thank you for sharing that time with us as well.', 'With appreciation,<br>The SCRUB team'],
    footer: 'An administrative update about the SCRUB Cleaning Owner Giveaway.',
    note: 'HELD: repository rules explicitly authorize winner contact but do not expressly promise a nonwinner results email. Confirm published rules and permission for this communication before considering recipients. No offer or marketing CTA.',
  },
  {
    id: 'marketing', label: 'C · Marketing-consented participants', subject: 'Thank You for Entering the SCRUB Giveaway!',
    preheader: 'Thank you for entering. Explore a first month free with FIRST50.',
    eyebrow: 'THANK YOU, CLEANING OWNERS', title: 'Your next chapter.<br>A clearer way to run it.',
    paragraphs: ['Hello,', 'Thank you for entering the SCRUB Cleaning Owner Giveaway. The winner has been selected, and we appreciate everyone who participated.', 'If you completed the Cleaning Business Assessment, thank you for taking the time to reflect on your business.', 'Ready to explore SCRUB for your business?'],
    boxTitle: 'One month. Room to explore.', box: disclosure,
    extra: '<p>Your initial subscription payment for the promotional month is $0, assuming no additional charges apply. Review your selected plan\'s regular price and billing details before signing up.</p><p style="margin:28px 0"><a href="https://scrubscrubscrub.com" style="display:inline-block;background:#064e3b;color:#ffffff;padding:15px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Explore SCRUB</a></p>',
    footer: 'You are reviewing a sample for entrants who separately opted in to marketing. <span style="text-decoration:underline">Unsubscribe — preview placeholder</span><br>Scrubadub Solutions LLC · [approved postal address required]',
    note: 'HELD: FIRST50, payment collection, trial interaction, renewal timing, and cancellation behavior are not live-verified. Unsubscribe URL and postal address are placeholders. December giveaway omitted until confirmed.',
  },
];

function render(e) {
  const gold = e.id === 'winner';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e.subject}</title><style>@media(max-width:620px){.outer{padding:16px 8px!important}.content{padding:28px 22px!important}.headline{font-size:30px!important}.header{padding:24px 22px!important}}</style></head><body style="margin:0;background:#f3f6f4;color:#243b33;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${e.preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="outer" align="center" style="padding:40px 16px"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dce6df"><tr><td class="header" style="background:#064e3b;padding:28px 36px;border-top:5px solid ${gold ? '#b89447' : '#059669'}"><div style="font-size:28px;letter-spacing:3px;font-weight:bold;color:#ffffff">SCRUB</div><div style="color:#d1fae5;font-size:12px;letter-spacing:1px">BUILT FOR CLEANING BUSINESSES</div></td></tr><tr><td class="content" style="padding:38px 36px"><div style="font-size:12px;letter-spacing:2px;font-weight:bold;color:${gold ? '#786027' : '#047857'}">${e.eyebrow}</div><h1 class="headline" style="font-size:36px;line-height:1.18;letter-spacing:-1px;color:#064e3b;margin:18px 0 28px">${e.title}</h1>${e.paragraphs.map(p => `<p style="margin:0 0 18px">${p}</p>`).join('')}${e.box ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0;background:${gold ? '#faf6eb' : '#ecfdf5'};border-left:4px solid ${gold ? '#b89447' : '#059669'}"><tr><td style="padding:22px"><h2 style="margin:0 0 10px;font-size:20px;color:#064e3b">${e.boxTitle}</h2><p style="margin:0">${e.box}</p></td></tr></table>` : ''}${e.extra ?? ''}${e.id === 'winner' ? '<p style="margin-top:28px">With appreciation,<br>The SCRUB team</p><p style="font-size:14px"><a href="https://scrubscrubscrub.com" style="color:#065f46">scrubscrubscrub.com</a> · <a href="https://scrubscrubscrub.com/giveaway#official-rules" style="color:#065f46">Official Rules</a></p>' : ''}</td></tr><tr><td style="padding:24px 28px;background:#eef3f0;font-size:12px;line-height:1.7;color:#455b50">${e.footer}<br>SCRUB · Scrubadub Solutions LLC</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

mkdirSync(root, { recursive: true });
for (const e of emails) {
  writeFileSync(join(root, `${e.id}.html`), render(e));
  const plain = [e.subject, `Preview text: ${e.preheader}`, ...e.paragraphs, e.boxTitle, e.box, e.extra, e.footer].filter(Boolean).join('\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '');
  writeFileSync(join(root, `${e.id}.txt`), `${plain}\n\nREVIEW ONLY — ${e.note}\n`);
}
writeFileSync(join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCRUB email review</title><style>body{margin:0;background:#f3f6f4;color:#064e3b;font:16px/1.6 Arial;padding:24px}main{max-width:1100px;margin:auto}section{background:white;padding:24px;margin:24px 0;border:1px solid #dce6df}iframe{display:block;width:100%;height:1100px;border:1px solid #dce6df;background:#f3f6f4;box-sizing:border-box}a{color:#065f46}button{padding:12px;margin:0 8px 12px 0;cursor:pointer}</style><main><h1>SCRUB · Giveaway email review</h1><p><strong>PREVIEW ONLY · NO EMAILS SENT · NOT APPROVED FOR DELIVERY</strong></p><p>Sample recipient: Sample Entrant. Actual recipient addresses are intentionally excluded. Marketing terms remain pending Stripe verification.</p><button onclick="document.querySelectorAll('iframe').forEach(f=>f.style.maxWidth='100%')">Desktop</button><button onclick="document.querySelectorAll('iframe').forEach(f=>f.style.maxWidth='375px')">Mobile · 375px</button>${emails.map(e => `<section><h2>${e.label}</h2><p><strong>Subject:</strong> ${e.subject}<br><strong>Preview text:</strong> ${e.preheader}</p><p>${e.note}</p><p><a href="${e.id}.html">Open actual HTML</a> · <a href="${e.id}.txt">Read copy</a></p><iframe title="${e.label}" src="${e.id}.html"></iframe></section>`).join('')}</main></html>`);
console.log('Generated three offline email drafts and review gallery. No delivery capability.');
