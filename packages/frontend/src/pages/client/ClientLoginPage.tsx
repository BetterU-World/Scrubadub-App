import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useClientAuth } from "@/hooks/useClientAuth";

export function ClientLoginPage() {
  const { t } = useTranslation();
  const { signIn } = useClientAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn({ email, password });
      window.location.assign("/client/home");
    } catch (err: any) {
      setError(err.message || t("clientAuth.signInFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <img src="/logo-icon.png" alt="SCRUB" className="mx-auto mb-3 h-12 w-12" />
          <img src="/logo-word.png" alt="SCRUB" className="mx-auto h-8 w-auto" />
          <p className="mt-2 text-gray-500">{t("clientAuth.loginSubtitle")}</p>
        </div>
        <div className="card">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">{t("clientAuth.signIn")}</h1>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t("auth.email")}</span>
              <input className="input-field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t("auth.password")}</span>
              <PasswordInput className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
            </label>
            <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2">
              {loading && <LoadingSpinner size="sm" />}
              {t("clientAuth.signIn")}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
              {t("clientAuth.staffLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
