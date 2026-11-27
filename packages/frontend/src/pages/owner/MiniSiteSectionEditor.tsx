import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  HIGHLIGHT_ICONS,
  MINI_SITE_SECTIONS,
  SECTION_LIMITS,
  miniSiteSectionHeadingKey,
  type MiniSiteSection,
  type MiniSiteSectionEntry,
} from "../../../../../convex/lib/miniSiteSections";

function moved<T>(items: T[], index: number, offset: -1 | 1) {
  const next = [...items];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}

function OrderButtons({ label, index, count, onMove }: {
  label: string;
  index: number;
  count: number;
  onMove: (offset: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1">
      {([-1, 1] as const).map((offset) => {
        const unavailable = index + offset < 0 || index + offset >= count;
        const Icon = offset === -1 ? ArrowUp : ArrowDown;
        return (
          <button
            key={offset}
            type="button"
            aria-label={t(offset === -1 ? "miniSiteSections.moveUp" : "miniSiteSections.moveDown", { label })}
            aria-disabled={unavailable}
            className="touch-target inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 aria-disabled:cursor-default aria-disabled:opacity-40"
            onClick={() => { if (!unavailable) onMove(offset); }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

const FAQ_PROMPTS = ["supplies", "home", "areas", "quote", "cancellation", "insurance", "recurring", "extras"] as const;

export function MiniSiteSectionEditor({ sections, onChange, previewAction }: {
  sections: MiniSiteSection[];
  onChange: (sections: MiniSiteSection[]) => void;
  previewAction: ReactNode;
}) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState("");
  const [editingId, setEditingId] = useState<MiniSiteSection["id"] | null>(null);
  const announceMove = (label: string, position: number) => {
    setAnnouncement(t("miniSiteSections.moved", { label, position }));
  };

  return (
    <section aria-labelledby="microsite-sections-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="microsite-sections-heading" className="text-lg font-semibold text-gray-900">{t("miniSiteSections.title")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("miniSiteSections.help")}</p>
        </div>
        {previewAction}
      </div>
      <p role="status" className="sr-only">{announcement}</p>
      <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <strong>{t("miniSiteSections.introduction")}</strong> · {t("miniSiteSections.fixed")}
      </p>
      <ol className="space-y-3">
        {sections.map((section, index) => {
          const name = t(miniSiteSectionHeadingKey(section.id));
          const update = (next: MiniSiteSection) => onChange(sections.map((item) => item.id === section.id ? next : item));
          const expanded = editingId === section.id;
          const panelId = `site-section-${section.id}-editor`;
          return (
            <li key={section.id} className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
                <button
                  type="button"
                  className="touch-target flex min-w-0 items-center gap-2 text-left font-semibold text-gray-900"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setEditingId(expanded ? null : section.id)}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  <span>{name}</span>
                  <span className="sr-only"> {t("miniSiteSections.editContent")}</span>
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={section.enabled} onChange={(event) => update({ ...section, enabled: event.target.checked })} />
                    <span>{t("miniSiteSections.show")}<span className="sr-only"> {name}</span></span>
                  </label>
                  <OrderButtons label={name} index={index} count={sections.length} onMove={(offset) => {
                    onChange(moved(sections, index, offset));
                    announceMove(name, index + offset + 1);
                  }} />
                </div>
              </div>
              <div id={panelId} hidden={!expanded} className="space-y-4 border-t border-gray-100 px-3 py-4 sm:px-4">
                {expanded && (
                  <>
                    <label className="block text-sm font-medium text-gray-700">
                      {t("miniSiteSections.heading")}
                      <input className="input-field mt-1" maxLength={SECTION_LIMITS.heading} value={section.heading ?? ""} placeholder={name}
                        onChange={(event) => update({ ...section, heading: event.target.value })} />
                    </label>
                    {MINI_SITE_SECTIONS[section.id].entryBodyLimit > 0
                      ? <EntryEditor section={section} onChange={update} onMove={announceMove} />
                      : <p className="text-sm text-gray-600">{t(`miniSiteSections.sources.${section.id}`)}</p>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <strong>{t("miniSiteSections.contact")}</strong> · {t("miniSiteSections.fixed")}
      </p>
    </section>
  );
}

function EntryEditor({ section, onChange, onMove }: {
  section: MiniSiteSection;
  onChange: (section: MiniSiteSection) => void;
  onMove: (label: string, position: number) => void;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const entries = section.entries ?? [];
  const faq = section.id === "faq";
  const legacy = section.id === "howItWorks" && section.entries === undefined;
  const full = entries.length >= SECTION_LIMITS.entries;
  const add = (suggestedTitle = "") => {
    if (full) return;
    onChange({
      ...section,
      entries: [...entries, { id: crypto.randomUUID(), title: suggestedTitle, body: "", enabled: !suggestedTitle }],
    });
  };
  const edit = (id: string, changes: Partial<MiniSiteSectionEntry>) => {
    onChange({ ...section, entries: entries.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t(legacy ? "miniSiteSections.legacyProcess" : "miniSiteSections.entryHelp")}</p>
      {section.id === "highlights" && <p className="text-sm text-gray-600">{t("miniSiteSections.highlightsHelp")}</p>}
      {!entries.length && !legacy && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{t("miniSiteSections.empty")}</p>}
      <ol className="space-y-3">
        {entries.map((entry, index) => {
          const label = entry.title.trim() || t("miniSiteSections.item", { position: index + 1 });
          return (
            <li key={entry.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={entry.enabled} onChange={(event) => edit(entry.id, { enabled: event.target.checked })} />
                  {t("miniSiteSections.showItem")}<span className="sr-only"> {label}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <OrderButtons label={label} index={index} count={entries.length} onMove={(offset) => {
                    onChange({ ...section, entries: moved(entries, index, offset) });
                    onMove(label, index + offset + 1);
                  }} />
                  <button type="button" aria-label={t("miniSiteSections.deleteItem", { label })}
                    className="touch-target rounded-lg px-2 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => onChange({ ...section, entries: entries.filter(({ id }) => id !== entry.id) })}>
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <div className="grid gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  {t(faq ? "miniSiteSections.question" : "miniSiteSections.itemTitle")}
                  <input className="input-field mt-1" maxLength={SECTION_LIMITS.title} value={entry.title}
                    onChange={(event) => edit(entry.id, { title: event.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  {t(faq ? "miniSiteSections.answer" : "miniSiteSections.description")}
                  <textarea className="input-field mt-1" rows={3} maxLength={MINI_SITE_SECTIONS[section.id].entryBodyLimit} value={entry.body}
                    onChange={(event) => edit(entry.id, { body: event.target.value })} />
                </label>
                {section.id === "highlights" && (
                  <label className="block text-sm font-medium text-gray-700">
                    {t("miniSiteSections.icon")}
                    <select className="input-field mt-1" value={entry.icon ?? ""} onChange={(event) => edit(entry.id, { icon: event.target.value || undefined })}>
                      <option value="">{t("miniSiteSections.noIcon")}</option>
                      {HIGHLIGHT_ICONS.map((icon) => <option key={icon} value={icon}>{t(`miniSiteSections.icons.${icon}`)}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn-secondary touch-target inline-flex items-center gap-2 disabled:opacity-50" disabled={full} onClick={() => add()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t(`miniSiteSections.add.${section.id}`)}
      </button>
      {full && <p className="text-sm text-gray-600">{t("miniSiteSections.itemLimit", { count: SECTION_LIMITS.entries })}</p>}
      {faq && !full && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-medium text-gray-700">
            {t("miniSiteSections.suggestions")}
            <select className="input-field mt-1" value={prompt} onChange={(event) => setPrompt(event.target.value)}>
              <option value="">{t("miniSiteSections.choosePrompt")}</option>
              {FAQ_PROMPTS.map((key) => <option key={key} value={key}>{t(`miniSiteSections.prompts.${key}`)}</option>)}
            </select>
          </label>
          <button type="button" className="btn-secondary touch-target disabled:opacity-50" disabled={!prompt}
            onClick={() => { add(t(`miniSiteSections.prompts.${prompt}`)); setPrompt(""); }}>
            {t("miniSiteSections.usePrompt")}
          </button>
        </div>
      )}
    </div>
  );
}
