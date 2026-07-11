import { useRef, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Save } from "lucide-react";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { MergeFieldSidebar } from "@/components/documents/MergeFieldSidebar";
import {
  SERVICE_AGREEMENT_FIELDS,
  type MergeFieldDefinition,
} from "@/lib/documentMergeFields";

type Props = {
  name: string;
  body: string;
  saving?: boolean;
  dirty?: boolean;
  templateSource?: string;
  isDefault?: boolean;
  fields?: MergeFieldDefinition[];
  onNameChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  defaultAction?: ReactNode;
};

export function TemplateEditor({
  name,
  body,
  saving,
  dirty = false,
  templateSource,
  isDefault,
  fields = SERVICE_AGREEMENT_FIELDS,
  onNameChange,
  onBodyChange,
  onSave,
  defaultAction,
}: Props) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertToken = (token: string) => {
    const textarea = textAreaRef.current;
    if (!textarea) {
      onBodyChange(`${body}${body ? "\n" : ""}${token}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextBody = `${body.slice(0, start)}${token}${body.slice(end)}`;
    onBodyChange(nextBody);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const sourceLabel =
    templateSource === "scrub_default"
      ? "SCRUB-provided"
      : templateSource
        ? "Company customized"
        : null;
  const statusLabel = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            Service Agreement Template
          </p>
          <h2
            className="mt-1 truncate text-xl font-semibold text-gray-900"
            title={name}
          >
            {name || "Untitled template"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Edit the content used to create new client service agreements.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceLabel && (
              <span className="badge bg-gray-100 text-gray-700">
                {sourceLabel}
              </span>
            )}
            {isDefault && (
              <span className="badge bg-green-100 text-green-700">
                Default for new agreements
              </span>
            )}
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
            saving || dirty
              ? "bg-amber-50 text-amber-700"
              : "bg-green-50 text-green-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {saving || dirty ? (
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {statusLabel}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Template content
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Use merge fields to insert details that SCRUB fills when the
              document is created.
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Template name
            </span>
            <input
              className="input-field mt-1"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Template body
            </span>
            <textarea
              ref={textAreaRef}
              className="input-field mt-1 min-h-[380px] font-mono text-sm leading-6"
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
            />
          </label>
          <MergeFieldSidebar fields={fields} onInsert={insertToken} />
        </div>
        <DocumentPreview body={body} />
      </div>

      <footer className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>{defaultAction}</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-sm text-gray-500">{statusLabel}</span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="btn-primary flex items-center justify-center gap-2 text-sm"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </footer>
    </div>
  );
}
