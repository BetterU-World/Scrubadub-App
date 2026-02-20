import { useState, FormEvent } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useParams, useLocation } from "wouter";
import { LoadingSpinner, PageLoader } from "@/components/ui/LoadingSpinner";

export function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const inviteInfo = useQuery(api.queries.employees.getByInviteToken, {
    token: params.token ?? "",
  });
  const acceptInvite = useAction(api.employeeActions.acceptInvite);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (inviteInfo === undefined) return <PageLoader />;

  if (inviteInfo === null || inviteInfo.status !== "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-2">Invalid Invite</h2>
          <p className="text-gray-500 mb-4">This invite link is invalid or has already been used.</p>
          <a href="/login" className="btn-primary inline-block">Go to Login</a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const result = await acceptInvite({ token: params.token!, password });
      localStorage.setItem("scrubadub_userId", String(result.userId));
      window.location.assign("/");
    } catch (err: any) {
      setError(err.message || "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">ScrubaDub</h1>
          <p className="text-gray-500 mt-2">Welcome to {inviteInfo.companyName}</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-2">Accept Invitation</h2>
          <p className="text-sm text-gray-500 mb-6">
            Hello {inviteInfo.name}! Set your password to get started.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input className="input-field bg-gray-50" value={inviteInfo.email} disabled />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                className="input-field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm your password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <LoadingSpinner size="sm" />}
              Join Team
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
