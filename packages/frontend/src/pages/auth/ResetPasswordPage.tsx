import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Link, useLocation, useParams } from "wouter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetPassword = useAction(api.authActions.resetPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/favicon-96x96.png" alt="SCRUB" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-primary-700">SCRUB</h1>
          <p className="text-gray-500 mt-2">
            {t("auth.resetPasswordSubtitle")}
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">{t("auth.resetPassword")}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {t("auth.resetSuccess")}
              </div>
              <p className="text-center text-sm text-gray-500">
                {t("auth.redirectingToLogin")}{" "}
                <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
                    {t("auth.goNow")}
                </Link>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("auth.newPassword")} <span className="text-red-500">*</span>
                  </label>
                  <PasswordInput
                    className="input-field"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder={t("auth.passwordNewPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("auth.confirmPassword")} <span className="text-red-500">*</span>
                  </label>
                  <PasswordInput
                    className="input-field"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder={t("auth.passwordConfirmPlaceholder")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <LoadingSpinner size="sm" />}
                  {t("auth.resetPassword")}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
                    {t("auth.backToSignIn")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
