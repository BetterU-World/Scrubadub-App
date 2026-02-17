import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Link } from "wouter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetLink, setResetLink] = useState("");

  const requestReset = useAction(api.authActions.requestPasswordReset);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestReset({ email });
      setSubmitted(true);
      // For MVP, show the reset link directly since we can't send email
      if (result?.token) {
        setResetLink(`/reset-password/${result.token}`);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">ScrubaDub</h1>
          <p className="text-gray-500 mt-2">
            Reset your password
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Forgot Password</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                If an account exists with this email, a reset link has been sent.
              </div>

              {resetLink && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="text-blue-700 font-medium mb-1">MVP: Reset link (would be emailed in production)</p>
                  <Link href={resetLink}>
                    <a className="text-primary-600 font-medium hover:text-primary-700 break-all">
                      {window.location.origin}{resetLink}
                    </a>
                  </Link>
                </div>
              )}

              <p className="text-center text-sm text-gray-500">
                <Link href="/login">
                  <a className="text-primary-600 font-medium hover:text-primary-700">
                    Back to sign in
                  </a>
                </Link>
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <LoadingSpinner size="sm" />}
                  Send Reset Link
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                Remember your password?{" "}
                <Link href="/login">
                  <a className="text-primary-600 font-medium hover:text-primary-700">
                    Sign in
                  </a>
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
