import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";

type SettingsForm = {
  logoUrl: string;
  companyName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  licenseNumber: string;
  insuranceInformation: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  emailSignature: string;
  documentHeader: string;
  documentFooter: string;
  defaultFont: string;
  defaultDateFormat: string;
  defaultCurrency: string;
};

const EMPTY_FORM: SettingsForm = {
  logoUrl: "",
  companyName: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  licenseNumber: "",
  insuranceInformation: "",
  primaryColor: "",
  secondaryColor: "",
  accentColor: "",
  emailSignature: "",
  documentHeader: "",
  documentFooter: "",
  defaultFont: "",
  defaultDateFormat: "MM/dd/yyyy",
  defaultCurrency: "USD",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function CompanyProfilePage() {
  const { user, sessionToken } = useAuth();
  const settings = useQuery(
    (api as any).queries.companies.getCompanySettings,
    user?._id ? { userId: user._id, sessionToken } : "skip"
  );
  const updateSettings = useMutation((api as any).mutations.companies.upsertCompanySettings);

  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setForm({
      logoUrl: settings.logoUrl ?? "",
      companyName: settings.companyName ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      website: settings.website ?? "",
      address: settings.address ?? "",
      licenseNumber: settings.licenseNumber ?? "",
      insuranceInformation: settings.insuranceInformation ?? "",
      primaryColor: settings.primaryColor ?? "",
      secondaryColor: settings.secondaryColor ?? "",
      accentColor: settings.accentColor ?? "",
      emailSignature: settings.emailSignature ?? "",
      documentHeader: settings.documentHeader ?? "",
      documentFooter: settings.documentFooter ?? "",
      defaultFont: settings.defaultFont ?? "",
      defaultDateFormat: settings.defaultDateFormat ?? "MM/dd/yyyy",
      defaultCurrency: settings.defaultCurrency ?? "USD",
    });
  }, [settings]);

  if (!user || settings === undefined) return <PageLoader />;

  const set = (key: keyof SettingsForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings({
        sessionToken,
        userId: user._id,
        ...Object.fromEntries(
          Object.entries(form).map(([key, value]) => [key, value.trim() || undefined])
        ),
      });
      setToast("Company identity saved");
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save company identity");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Identity / Branding"
        description="Set the company identity SCRUB uses for document templates."
      />

      <div className="max-w-4xl space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Logo URL">
              <input
                className="input-field mt-1"
                value={form.logoUrl}
                onChange={(event) => set("logoUrl", event.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </Field>
            <Field label="Company name">
              <input
                className="input-field mt-1"
                value={form.companyName}
                onChange={(event) => set("companyName", event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input-field mt-1"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="input-field mt-1"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </Field>
            <Field label="Website">
              <input
                className="input-field mt-1"
                value={form.website}
                onChange={(event) => set("website", event.target.value)}
              />
            </Field>
            <Field label="Address">
              <input
                className="input-field mt-1"
                value={form.address}
                onChange={(event) => set("address", event.target.value)}
              />
            </Field>
            <Field label="License number">
              <input
                className="input-field mt-1"
                value={form.licenseNumber}
                onChange={(event) => set("licenseNumber", event.target.value)}
              />
            </Field>
            <Field label="Default currency">
              <input
                className="input-field mt-1"
                value={form.defaultCurrency}
                onChange={(event) => set("defaultCurrency", event.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <Field label="Insurance information">
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.insuranceInformation}
              onChange={(event) => set("insuranceInformation", event.target.value)}
            />
          </Field>
        </section>

        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Branding Defaults</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Primary color">
              <input
                className="input-field mt-1"
                value={form.primaryColor}
                onChange={(event) => set("primaryColor", event.target.value)}
                placeholder="#2563eb"
              />
            </Field>
            <Field label="Secondary color">
              <input
                className="input-field mt-1"
                value={form.secondaryColor}
                onChange={(event) => set("secondaryColor", event.target.value)}
                placeholder="#0f172a"
              />
            </Field>
            <Field label="Accent color">
              <input
                className="input-field mt-1"
                value={form.accentColor}
                onChange={(event) => set("accentColor", event.target.value)}
                placeholder="#14b8a6"
              />
            </Field>
            <Field label="Default font">
              <input
                className="input-field mt-1"
                value={form.defaultFont}
                onChange={(event) => set("defaultFont", event.target.value)}
                placeholder="Inter"
              />
            </Field>
            <Field label="Default date format">
              <input
                className="input-field mt-1"
                value={form.defaultDateFormat}
                onChange={(event) => set("defaultDateFormat", event.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Document Defaults</h2>
          <Field label="Email signature">
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.emailSignature}
              onChange={(event) => set("emailSignature", event.target.value)}
            />
          </Field>
          <Field label="Document header">
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.documentHeader}
              onChange={(event) => set("documentHeader", event.target.value)}
            />
          </Field>
          <Field label="Document footer">
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.documentFooter}
              onChange={(event) => set("documentFooter", event.target.value)}
            />
          </Field>
        </section>

        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save identity"}
        </button>
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
