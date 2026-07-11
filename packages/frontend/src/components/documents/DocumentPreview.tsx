import { renderTemplatePreview } from "@/lib/documentMergeFields";

export function DocumentPreview({ body }: { body: string }) {
  const rendered = renderTemplatePreview(body);

  return (
    <section
      aria-labelledby="template-preview-heading"
      className="rounded-xl border border-gray-200 bg-gray-100 p-4 sm:p-6"
    >
      <div className="mb-4">
        <h3
          id="template-preview-heading"
          className="text-base font-semibold text-gray-900"
        >
          Live Sample Preview
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Merge fields are replaced with sample data to help you review the
          document.
        </p>
      </div>
      <div className="mx-auto min-h-[520px] max-w-[680px] whitespace-pre-wrap rounded-sm border border-gray-200 bg-white px-6 py-8 text-sm leading-7 text-gray-800 shadow-sm sm:px-10 sm:py-10">
        {rendered || (
          <span className="text-gray-400">Preview will appear here.</span>
        )}
      </div>
    </section>
  );
}
