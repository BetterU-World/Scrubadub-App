import { ChevronDown, Copy, Plus } from "lucide-react";
import { tokenForField, type MergeFieldDefinition } from "@/lib/documentMergeFields";

type Props = {
  fields: MergeFieldDefinition[];
  onInsert?: (token: string) => void;
};

export function MergeFieldSidebar({ fields, onInsert }: Props) {
  const grouped = fields.reduce<Record<string, MergeFieldDefinition[]>>((acc, field) => {
    acc[field.category] = [...(acc[field.category] ?? []), field];
    return acc;
  }, {});

  const copy = async (token: string) => {
    await navigator.clipboard?.writeText(token);
  };

  return (
    <aside className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Auto-fill fields</h3>
        <p className="mt-1 text-sm text-gray-500">
          Use fields to automatically fill client, company, proposal, and agreement details
          when SCRUB generates a document.
        </p>
      </div>
      {Object.entries(grouped).map(([category, categoryFields]) => (
        <details key={category} className="group rounded-md border border-gray-200 bg-white" open={category === "Company"}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-gray-900">
            <span>{category}</span>
            <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-1 border-t border-gray-100 p-2">
            {categoryFields.map((field) => {
              const token = tokenForField(field.key);
              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{field.label}</p>
                    <p className="truncate font-mono text-[11px] text-gray-400">{token}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {onInsert && (
                      <button
                        type="button"
                        className="rounded p-1.5 text-primary-600 hover:bg-primary-50 hover:text-primary-700"
                        onClick={() => onInsert(token)}
                        title="Insert field"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      onClick={() => copy(token)}
                      title="Copy field"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </aside>
  );
}
