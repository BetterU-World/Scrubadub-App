import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-4 px-4 md:px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          &copy; {new Date().getFullYear()} Scrubadub Solutions. SCRUB
          (powered by Scrubadub Solutions).
        </span>
        <nav className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-gray-700">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-gray-700">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-gray-700">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
