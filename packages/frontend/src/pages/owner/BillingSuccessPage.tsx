import { Link } from "wouter";
import { CheckCircle } from "lucide-react";

export function BillingSuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 rounded-full bg-green-100 text-green-600 mb-4">
        <CheckCircle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        You're all set!
      </h1>
      <p className="text-gray-500 mb-6">
        Your subscription is now active. Welcome to Scrubadub!
      </p>
      <Link href="/" className="btn-primary">
        Go to Dashboard
      </Link>
    </div>
  );
}
