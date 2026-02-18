import { Link } from "wouter";
import { XCircle } from "lucide-react";

export function BillingCancelPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 rounded-full bg-gray-100 text-gray-500 mb-4">
        <XCircle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Checkout cancelled
      </h1>
      <p className="text-gray-500 mb-6">
        No worries — you can subscribe anytime.
      </p>
      <Link href="/subscribe" className="btn-primary">
        Back to Plans
      </Link>
    </div>
  );
}
