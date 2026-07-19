import { useState, FormEvent } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { STAFF_SESSION_KEY } from "../../hooks/useAuth";
import { useParams, useLocation } from "wouter";
import { LoadingSpinner, PageLoader } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "react-i18next";

type InviteState = "expired" | "accepted" | "revoked" | "invalid";

function InviteStateCard({ state }: { state: InviteState }) {
  const { t } = useTranslation();
  const showSignIn = state === "accepted";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-xl font-semibold mb-2">{t(`invite.states.${state}.title`)}</h1>
        <p className="text-gray-500 mb-4">{t(`invite.states.${state}.body`)}</p>
        {showSignIn && <a href="/login" className="btn-primary inline-block">{t("invite.signIn")}</a>}
      </div>
    </div>
  );
}

export function AcceptInvitePage() {
  const { t } = useTranslation();
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

  if (inviteInfo === null) return <InviteStateCard state="invalid" />;
  if (inviteInfo.state !== "valid") return <InviteStateCard state={inviteInfo.state} />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const result = await acceptInvite({ token: params.token!, password });
      localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken);
      window.location.assign("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("INVITE_EXPIRED")) return setError(t("invite.states.expired.body"));
      if (message.includes("INVITE_ACCEPTED")) return setError(t("invite.states.accepted.body"));
      if (message.includes("INVITE_REVOKED")) return setError(t("invite.states.revoked.body"));
      if (message.includes("INVITE_INVALID")) return setError(t("invite.states.invalid.body"));
      setError(t("invite.acceptFailedSafe"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-icon.png" alt="SCRUB" className="w-12 h-12 mx-auto mb-3" />
          <img src="/logo-word.png" alt="SCRUB" className="h-8 w-auto mx-auto" />
          <p className="text-gray-500 mt-2">
            {inviteInfo.role === "affiliate"
              ? "Join the SCRUB Affiliate Program"
              : `Welcome to ${inviteInfo.companyName}`}
          </p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
              <PasswordInput
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 10 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password <span className="text-red-500">*</span></label>
              <PasswordInput
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
              {inviteInfo.role === "affiliate" ? "Get Started" : "Join Team"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
