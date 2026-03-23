import { useState, FormEvent } from "react";
import { Link } from "wouter";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { CheckCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function PostCheckoutSetupPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const completeSetup = useAction(
    api.actions.publicBilling.completePublicSetup
  );

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Missing checkout information
          </h1>
          <p className="text-gray-500 mb-6">
            It looks like you arrived here without completing checkout.
          </p>
          <Link href="/get-started" className="btn-primary">
            Start Checkout
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await completeSetup({
        stripeSessionId: sessionId,
        name,
        password,
        companyName,
      });
      localStorage.setItem("scrubadub_userId", String(result.userId));
      window.location.assign("/");
    } catch (err: any) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <img src="/favicon-96x96.png" alt="SCRUB" className="w-7 h-7" />
            <span className="text-xl font-bold text-primary-700">SCRUB</span>
          </span>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-full bg-green-100 text-green-600 mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Payment successful!
          </h1>
          <p className="text-gray-500 mt-2">
            Now let's set up your account.
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Create Your Account</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Sparkle Clean LLC"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 10 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <LoadingSpinner size="sm" />}
              Complete Setup
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary-600 font-medium hover:text-primary-700"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
