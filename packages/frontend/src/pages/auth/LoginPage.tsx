import { useState, FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

export function LoginPage() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn({ email, password });
      window.location.assign("/");
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-icon.png" alt="SCRUB" className="w-12 h-12 mx-auto mb-3" />
          <img src="/logo-word.png" alt="SCRUB" className="h-8 w-auto mx-auto" />
          <p className="text-gray-500 mt-2">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-2">{t("auth.staffLoginTitle")}</h2>
          <p className="mb-6 text-sm text-gray-500">{t("auth.staffLoginHelper")}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("auth.email")} <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("auth.password")} <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
              />
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-sm text-primary-600 font-medium hover:text-primary-700">
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <LoadingSpinner size="sm" />}
              {t("auth.signIn")}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            {t("auth.noAccount")}{" "}
            <Link href="/signup" className="text-primary-600 font-medium hover:text-primary-700">
              {t("auth.signUp")}
            </Link>
          </p>
          <p className="mt-4 border-t border-gray-100 pt-4 text-center text-sm text-gray-500">
            <Link href="/client/login" className="font-medium text-primary-600 hover:text-primary-700">
              {t("auth.clientPortalLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
