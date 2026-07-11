import { useState } from "react";
import { Check, ChevronDown, Copy, Plus } from "lucide-react";
import {
  tokenForField,
  type MergeFieldDefinition,
} from "@/lib/documentMergeFields";

type Props = {
  fields: MergeFieldDefinition[];
  onInsert?: (token: string) => void;
};

export function MergeFieldSidebar({ fields, onInsert }: Props) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {
      Client: true,
      Property: true,
      Agreement: true,
    },
  );
  const grouped = fields.reduce<Record<string, MergeFieldDefinition[]>>(
    (acc, field) => {
      acc[field.category] = [...(acc[field.category] ?? []), field];
      return acc;
    },
    {},
  );

  const copy = async (token: string) => {
    await navigator.clipboard?.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  const toggleCategory = (category: string) => {
    setOpenCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  };

  return (
    <aside
      aria-labelledby="merge-fields-heading"
      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div>
        <h3
          id="merge-fields-heading"
          className="text-base font-semibold text-gray-900"
        >
          Merge Fields
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Place your cursor in the template, then insert a field. Company fields
          come from Company Identity &amp; Branding.
        </p>
      </div>
      <div className="mt-4 space-y-2 lg:max-h-[420px] lg:overflow-y-auto lg:pr-1">
        {Object.entries(grouped).map(([category, categoryFields]) => {
          const isOpen = Boolean(openCategories[category]);
          const panelId = `merge-fields-${category.toLowerCase()}`;
          return (
            <div
              key={category}
              className="rounded-md border border-gray-200 bg-white"
            >
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={() => toggleCategory(category)}
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <span className="text-sm font-semibold text-gray-800">
                  {category}
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {categoryFields.length}{" "}
                  {categoryFields.length === 1 ? "field" : "fields"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {isOpen && (
                <div
                  id={panelId}
                  className="space-y-1 border-t border-gray-100 p-2"
                >
                  {categoryFields.map((field) => {
                    const token = tokenForField(field.key);
                    return (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-gray-900">
                            {field.label}
                          </p>
                          <p className="truncate font-mono text-[11px] text-gray-500">
                            {token}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {onInsert && (
                            <button
                              type="button"
                              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-primary-700 hover:bg-primary-50 hover:text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                              onClick={() => onInsert(token)}
                              title="Insert field"
                              aria-label={`Insert ${field.label}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            onClick={() => copy(token)}
                            title={
                              copiedToken === token ? "Copied" : "Copy field"
                            }
                            aria-label={`Copy ${field.label}`}
                          >
                            {copiedToken === token ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copiedToken ? `${copiedToken} copied to clipboard` : ""}
      </p>
    </aside>
  );
}
