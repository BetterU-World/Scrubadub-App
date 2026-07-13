import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function ClientForgotPasswordPage() {
  const { t } = useTranslation();
  const requestReset = useAction(api.clientAuthActions.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try { await requestReset({ email }); setSubmitted(true); }
    catch (err: any) { setError(err.message || t("clientAuth.resetRequestFailed")); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen bg-gray-50 px-4 py-10">
    <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
    <div className="mx-auto max-w-md">
      <div className="mb-8 text-center"><img src="/logo-icon.png" alt="SCRUB" className="mx-auto mb-3 h-12 w-12" /><img src="/logo-word.png" alt="SCRUB" className="mx-auto h-8 w-auto" /><p className="mt-2 text-gray-500">{t("clientAuth.resetContext")}</p></div>
      <div className="card">
        <h1 className="mb-2 text-xl font-semibold">{t("clientAuth.forgotPasswordTitle")}</h1>
        <p className="mb-6 text-sm text-gray-500">{t("clientAuth.forgotInstructions")}</p>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {submitted ? <div className="space-y-4"><div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{t("clientAuth.resetEmailSent")}</div><Link href="/client/login" className="block text-center text-sm font-medium text-primary-600">{t("clientAuth.backToSignIn")}</Link></div> :
          <form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1 block text-sm font-medium">{t("auth.email")}</span><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label><button disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2">{loading && <LoadingSpinner size="sm" />}{t("clientAuth.sendResetLink")}</button></form>}
      </div>
    </div>
  </div>;
}
