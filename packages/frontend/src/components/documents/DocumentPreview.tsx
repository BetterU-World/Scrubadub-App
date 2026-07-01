import { renderTemplatePreview } from "@/lib/documentMergeFields";

export function DocumentPreview({ body }: { body: string }) {
  const rendered = renderTemplatePreview(body);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase text-gray-500">Preview</p>
      <div className="min-h-[240px] whitespace-pre-wrap text-sm leading-6 text-gray-800">
        {rendered || "Preview will appear here."}
      </div>
    </div>
  );
}
