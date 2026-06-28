import { FormEvent, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { useParams } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner, PageLoader } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useTranslation } from "react-i18next";

export function ClientAcceptInvitePage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();
  const acceptInvite = useAction(api.clientAuthActions.acceptInvite);
  const getInviteInfo = useAction(api.clientAuthActions.getInviteInfo);
  const { setSignedInClient } = useClientAuth();
  const [inviteInfo, setInviteInfo] = useState<null | { email: string; displayName: string } | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params.token) return;
    getInviteInfo({ token: params.token })
      .then(setInviteInfo)
      .catch(() => setInviteInfo(null));
  }, [getInviteInfo, params.token]);

  if (inviteInfo === undefined) return <PageLoader />;

  if (!inviteInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">{t("clientAuth.invalidInvite")}</h1>
          <a href="/client/login" className="btn-primary inline-block">{t("clientAuth.goToLogin")}</a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsNoMatch"));
      return;
    }
    setLoading(true);
    try {
      const result = await acceptInvite({ token: params.token!, password });
      setSignedInClient(result.clientUserId);
      window.location.assign("/client/home");
    } catch (err: any) {
      setError(err.message || t("clientAuth.acceptFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/logo-icon.png" alt="SCRUB" className="mx-auto mb-3 h-12 w-12" />
          <img src="/logo-word.png" alt="SCRUB" className="mx-auto h-8 w-auto" />
          <p className="mt-2 text-gray-500">{t("clientAuth.acceptSubtitle")}</p>
        </div>
        <div className="card">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">{t("clientAuth.acceptInvite")}</h1>
          <p className="mb-6 text-sm text-gray-500">{t("clientAuth.hello", { name: inviteInfo.displayName })}</p>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t("auth.email")}</span>
              <input className="input-field bg-gray-50" value={inviteInfo.email} disabled />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t("auth.password")}</span>
              <PasswordInput className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t("auth.confirmPassword")}</span>
              <PasswordInput className="input-field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </label>
            <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2">
              {loading && <LoadingSpinner size="sm" />}
              {t("clientAuth.acceptInvite")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
