import Markdown from "react-markdown";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import ownerMd from "@/manuals/owner.md?raw";
import cleanerMd from "@/manuals/cleaner.md?raw";

const MANUALS: Record<string, { title: string; content: string }> = {
  owner: { title: "Owner Manual", content: ownerMd },
  cleaner: { title: "Cleaner Manual", content: cleanerMd },
};

export function ManualViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const manual = MANUALS[slug];

  if (!manual) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Manual Not Found
        </h1>
        <Link href="/manuals" className="text-primary-600 hover:text-primary-700">
          Back to Manuals
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/manuals"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Manuals
      </Link>
      <article className="prose prose-gray max-w-none sm:max-w-2xl mx-auto">
        <Markdown>{manual.content}</Markdown>
      </article>
    </div>
  );
}
