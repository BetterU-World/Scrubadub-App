import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Link } from "wouter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const requestReset = useAction(api.authActions.requestPasswordReset);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestReset({ email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
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
          <img src="/favicon-96x96.png" alt="SCRUB" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-primary-700">SCRUB</h1>
          <p className="text-gray-500 mt-2">
            {t("auth.resetPasswordSubtitleForgot")}
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">{t("auth.forgotPasswordTitle")}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {t("auth.resetEmailSent")}
              </div>

              <p className="text-center text-sm text-gray-500">
                <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
                    {t("auth.backToSignIn")}
                </Link>
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {t("auth.forgotInstructions")}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("auth.email")}
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

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <LoadingSpinner size="sm" />}
                  {t("auth.sendResetLink")}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                {t("auth.rememberPassword")}{" "}
                <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
                    {t("auth.signIn")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
