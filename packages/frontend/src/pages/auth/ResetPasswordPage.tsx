import { useState, FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Link, useLocation, useParams } from "wouter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetPassword = useMutation(api.authActions.resetPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ token: params.token, newPassword: password });
      setSuccess(true);
      // Redirect to login after a short delay
      setTimeout(() => setLocation("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
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
            Set a new password
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Reset Password</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Password reset! Sign in now.
              </div>
              <p className="text-center text-sm text-gray-500">
                Redirecting to login...{" "}
                <Link href="/login">
                  <a className="text-primary-600 font-medium hover:text-primary-700">
                    Go now
                  </a>
                </Link>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <LoadingSpinner size="sm" />}
                  Reset Password
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                <Link href="/login">
                  <a className="text-primary-600 font-medium hover:text-primary-700">
                    Back to sign in
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
