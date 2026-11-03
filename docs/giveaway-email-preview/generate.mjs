// Offline review artifacts only. No recipient data, credentials, network, or delivery SDK.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
import { emails, render } from '../../convex/lib/giveawayEmailTemplates.js';

mkdirSync(root, { recursive: true });
for (const e of emails) {
  writeFileSync(join(root, `${e.id}.html`), render(e));
  const plain = [e.subject, `From display name: SCRUB Team`, `Preview text: ${e.preheader}`, ...e.paragraphs, e.boxTitle, e.box, e.extra, e.footer].filter(Boolean).join('\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '');
  writeFileSync(join(root, `${e.id}.txt`), `${plain}\n\nREVIEW ONLY — ${e.note}\n`);
}
writeFileSync(join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCRUB email review</title><style>body{margin:0;background:#f3f6f4;color:#064e3b;font:16px/1.6 Arial;padding:24px}main{max-width:1100px;margin:auto}section{background:white;padding:24px;margin:24px 0;border:1px solid #dce6df}iframe{display:block;width:100%;height:1100px;border:1px solid #dce6df;background:#f3f6f4;box-sizing:border-box}a{color:#065f46}button{padding:12px;margin:0 8px 12px 0;cursor:pointer}</style><main><h1>SCRUB · Giveaway email review</h1><p><strong>PREVIEW ONLY · NO EMAILS SENT · NOT APPROVED FOR DELIVERY</strong></p><p>Sample recipient: Sample Entrant. Only the winner and explicitly marketing-consented nonwinners are in campaign scope. Actual recipient addresses are intentionally excluded. FREESCRUB timeline is founder-confirmed. Sending requires separate explicit approval.</p><button onclick="document.querySelectorAll('iframe').forEach(f=>f.style.maxWidth='100%')">Desktop</button><button onclick="document.querySelectorAll('iframe').forEach(f=>f.style.maxWidth='375px')">Mobile · 375px</button>${emails.filter(e => !e.archived).map(e => `<section><h2>${e.label}</h2><p><strong>From display name:</strong> SCRUB Team<br><strong>Subject:</strong> ${e.subject}<br><strong>Preview text:</strong> ${e.preheader}</p><p>${e.note}</p><p><a href="${e.id}.html">Open actual HTML</a> · <a href="${e.id}.txt">Read copy</a></p><iframe title="${e.label}" src="${e.id}.html"></iframe></section>`).join('')}<section><h2>Archive · Not part of this campaign</h2><p>Template B is preserved for possible future use only. No recipients or sending workflow are authorized for it.</p><a href="results.html">Archived results HTML</a> · <a href="results.txt">Archived copy</a></section></main></html>`);
console.log('Generated three offline email drafts and review gallery. No delivery capability.');
