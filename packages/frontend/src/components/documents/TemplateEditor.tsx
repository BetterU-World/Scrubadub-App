import { useRef, useState } from "react";
import { Eye, Save } from "lucide-react";
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
  fields?: MergeFieldDefinition[];
  onNameChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
};

export function TemplateEditor({
  name,
  body,
  saving,
  fields = SERVICE_AGREEMENT_FIELDS,
  onNameChange,
  onBodyChange,
  onSave,
}: Props) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Template name</span>
          <input
            className="input-field mt-1"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Template body</span>
          <span className="mt-1 block text-xs text-gray-500">
            Write the reusable agreement language. SCRUB will fill fields like client name,
            property address, and pricing when it creates a new agreement.
          </span>
          <textarea
            ref={textAreaRef}
            className="input-field mt-2 min-h-[300px] font-mono text-xs leading-5"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Template"}
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen((open) => !open)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Eye className="h-4 w-4" />
            {previewOpen ? "Hide preview" : "Preview"}
          </button>
        </div>
        {previewOpen && <DocumentPreview body={body} />}
      </div>
      <details className="rounded-md border border-gray-200 bg-gray-50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900">
          Add auto-fill fields
        </summary>
        <div className="border-t border-gray-200 p-3">
          <MergeFieldSidebar fields={fields} onInsert={insertToken} />
        </div>
      </details>
    </div>
  );
}
