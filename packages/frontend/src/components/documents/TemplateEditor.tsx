import { useRef, type ReactNode } from "react";
import { Save } from "lucide-react";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { MergeFieldSidebar } from "@/components/documents/MergeFieldSidebar";
import {
  SERVICE_AGREEMENT_FIELDS,
  tokenForField,
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
  defaultAction?: ReactNode;
};

export function TemplateEditor({
  name,
  body,
  saving,
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Edit Template</h2>
          <p className="mt-1 text-sm text-gray-500">
            Edit the client-facing template used to create new service agreements.
          </p>
        </div>
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
          <textarea
            ref={textAreaRef}
            className="input-field mt-1 min-h-[320px] font-mono text-xs leading-5"
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
            {saving ? "Saving..." : "Save template"}
          </button>
          {defaultAction}
          <button
            type="button"
            onClick={() => insertToken(tokenForField("company_name"))}
            className="btn-secondary text-sm"
          >
            Insert company name
          </button>
        </div>
        <DocumentPreview body={body} />
      </div>
      <MergeFieldSidebar fields={fields} onInsert={insertToken} />
    </div>
  );
}
