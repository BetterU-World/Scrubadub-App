import { useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { tokenForField, type MergeFieldDefinition } from "@/lib/documentMergeFields";

type Props = {
  fields: MergeFieldDefinition[];
  onInsert?: (token: string) => void;
};

export function MergeFieldSidebar({ fields, onInsert }: Props) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const grouped = fields.reduce<Record<string, MergeFieldDefinition[]>>((acc, field) => {
    acc[field.category] = [...(acc[field.category] ?? []), field];
    return acc;
  }, {});

  const copy = async (token: string) => {
    await navigator.clipboard?.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  return (
    <aside className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Merge Fields</h2>
        <p className="mt-1 text-sm text-gray-500">
          Insert fields that SCRUB replaces with agreement details when a client document is created.
        </p>
      </div>
      {Object.entries(grouped).map(([category, categoryFields]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase text-gray-500">{category}</h3>
          <div className="mt-2 space-y-1">
            {categoryFields.map((field) => {
              const token = tokenForField(field.key);
              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-900">{field.label}</p>
                    <p className="truncate font-mono text-[11px] text-gray-500">{token}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {onInsert && (
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        onClick={() => onInsert(token)}
                        title="Insert field"
                        aria-label={`Insert ${field.label}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      onClick={() => copy(token)}
                      title={copiedToken === token ? "Copied" : "Copy field"}
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
        </div>
      ))}
    </aside>
  );
}
