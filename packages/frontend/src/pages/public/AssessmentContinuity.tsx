import { useState, useRef } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useTranslation } from "react-i18next";

export function AssessmentContinuity({
  attemptId,
  capability,
}: {
  attemptId?: string;
  capability?: string;
}) {
  const { t, i18n } = useTranslation();
  const request = useAction(
    (api as any).assessmentContinuityActions.requestReportLink,
  );
  const interest = useMutation(
    (api as any).assessmentContinuity.submitInterest,
  );
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    businessName: "",
    marketingConsent: false,
  });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
  if (!attemptId || !capability)
    return (
      <section
        aria-labelledby="continuity-heading"
        className="rounded-2xl bg-gray-50 p-6"
      >
        <h2
          id="continuity-heading"
          className="text-2xl font-bold text-gray-900"
        >
          {t("assessment.continuity.returnedTitle")}
        </h2>
        <p className="mt-3 leading-7 text-gray-600">
          {t("assessment.continuity.returnedCopy")}
        </p>
      </section>
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      await request({
        attemptId: attemptId as Id<"assessmentAttempts">,
        capability,
        email: form.email,
        firstName: form.firstName || undefined,
        businessName: form.businessName || undefined,
        language: i18n.resolvedLanguage === "es" ? "es" : "en",
        marketingConsent: form.marketingConsent,
      });
      setState("sent");
      setMessage(t("assessment.continuity.success"));
      setTimeout(() => statusRef.current?.focus(), 0);
    } catch {
      setState("error");
      setMessage(t("assessment.continuity.failure"));
      setTimeout(() => statusRef.current?.focus(), 0);
    }
  }
  async function saveInterest(interested: boolean) {
    try {
      await interest({
        attemptId: attemptId as Id<"assessmentAttempts">,
        capability,
        interested,
      });
      setMessage(t("assessment.continuity.interestSaved"));
      setTimeout(() => statusRef.current?.focus(), 0);
    } catch {
      setMessage(t("assessment.continuity.interestNeedsEmail"));
    }
  }
  return (
    <div className="space-y-8">
      <section
        aria-labelledby="continuity-heading"
        className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8"
      >
        <h2
          id="continuity-heading"
          className="text-2xl font-bold text-gray-900"
        >
          {t("assessment.continuity.title")}
        </h2>
        <p className="mt-3 leading-7 text-gray-600">
          {t("assessment.continuity.copy")}
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-medium text-gray-800">
              {t("assessment.continuity.email")}
            </span>
            <input
              required
              type="email"
              maxLength={254}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field mt-1"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-gray-800">
              {t("assessment.continuity.firstName")}
            </span>
            <input
              maxLength={80}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="input-field mt-1"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-gray-800">
              {t("assessment.continuity.businessName")}
            </span>
            <input
              maxLength={120}
              value={form.businessName}
              onChange={(e) =>
                setForm({ ...form, businessName: e.target.value })
              }
              className="input-field mt-1"
            />
          </label>
          <label className="sm:col-span-2 flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={(e) =>
                setForm({ ...form, marketingConsent: e.target.checked })
              }
              className="mt-1 h-5 w-5"
            />
            <span className="text-sm text-gray-700">
              {t("assessment.continuity.marketingConsent")}
            </span>
          </label>
          <p className="sm:col-span-2 text-xs leading-5 text-gray-500">
            {t("assessment.continuity.deliveryConsent")}
          </p>
          <button
            disabled={state === "sending"}
            className="btn-primary sm:col-span-2 sm:w-fit"
          >
            {state === "sending"
              ? t("assessment.continuity.sending")
              : t("assessment.continuity.submit")}
          </button>
        </form>
      </section>
      <section
        aria-labelledby="scrub-support-heading"
        className="rounded-2xl bg-primary-50 p-6 sm:p-8"
      >
        <h2
          id="scrub-support-heading"
          className="text-2xl font-bold text-gray-900"
        >
          {t("assessment.continuity.supportTitle")}
        </h2>
        <p className="mt-3 leading-7 text-gray-700">
          {t("assessment.continuity.supportCopy")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => saveInterest(true)}>
            {t("assessment.continuity.interested")}
          </button>
          <button className="btn-secondary" onClick={() => saveInterest(false)}>
            {t("assessment.continuity.notNow")}
          </button>
        </div>
      </section>
      <div
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={
          message
            ? "rounded-xl bg-gray-100 p-4 text-sm text-gray-800 outline-none"
            : "sr-only"
        }
      >
        {message}
      </div>
    </div>
  );
}
