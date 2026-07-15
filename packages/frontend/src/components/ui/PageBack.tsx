import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type PageBackProps = {
  href: string;
  label: string;
  className?: string;
};

export function PageBack({ href, label, className = "" }: PageBackProps) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${className}`}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 whitespace-normal break-words">{label}</span>
    </Link>
  );
}
