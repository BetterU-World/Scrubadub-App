import { renderTemplatePreview } from "@/lib/documentMergeFields";

export function DocumentPreview({ body }: { body: string }) {
  const rendered = renderTemplatePreview(body);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase text-gray-500">Sample Preview</p>
        <p className="mt-1 text-xs text-gray-500">
          This preview uses sample client, company, proposal, and agreement data.
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-6 text-gray-800">
        {rendered || "Preview will appear here."}
      </div>
    </div>
  );
}
