import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function ClientResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const resetPassword = useAction(api.clientAuthActions.resetPassword);
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password.length < 10) return setError(t("auth.passwordMinLength"));
    if (password !== confirm) return setError(t("auth.passwordsNoMatch"));
    setLoading(true);
    try { await resetPassword({ token, newPassword: password }); setSuccess(true); }
    catch (err: any) { setError(err.message || t("clientAuth.resetFailed")); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen bg-gray-50 px-4 py-10">
    <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
    <div className="mx-auto max-w-md"><div className="mb-8 text-center"><img src="/logo-icon.png" alt="SCRUB" className="mx-auto mb-3 h-12 w-12" /><img src="/logo-word.png" alt="SCRUB" className="mx-auto h-8 w-auto" /><p className="mt-2 text-gray-500">{t("clientAuth.resetContext")}</p></div>
      <div className="card"><h1 className="mb-6 text-xl font-semibold">{t("clientAuth.resetPasswordTitle")}</h1>{error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {success ? <div className="space-y-4"><div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{t("clientAuth.resetSuccess")}</div><Link href="/client/login" className="block text-center font-medium text-primary-600">{t("clientAuth.signInWithNewPassword")}</Link></div> :
          <form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1 block text-sm font-medium">{t("auth.newPassword")}</span><PasswordInput className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" /></label><label className="block"><span className="mb-1 block text-sm font-medium">{t("auth.confirmPassword")}</span><PasswordInput className="input-field" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></label><button disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2">{loading && <LoadingSpinner size="sm" />}{t("clientAuth.resetPasswordTitle")}</button></form>}
      </div>
    </div>
  </div>;
}
