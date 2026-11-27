import { useTranslation } from "react-i18next";
import {
  REVIEW_PLATFORMS, SITE_CONTENT_LIMITS, SOCIAL_PLATFORMS, WEEKDAYS,
  safeMiniSiteProfile, validMiniSiteHours,
  type MiniSiteHours, type MiniSitePresentation, type MiniSiteProfile,
} from "../../../../../convex/lib/miniSitePresentation";

export function BusinessHoursFields({ hours, onChange }: {
  hours: MiniSiteHours[];
  onChange: (hours: MiniSiteHours[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t("sitePresentation.hoursHelp")}</p>
      {WEEKDAYS.map((day) => {
        const setting = hours.find((entry) => entry.day === day);
        const change = (next?: MiniSiteHours) => onChange([...hours.filter((entry) => entry.day !== day), ...(next ? [next] : [])]);
        const label = t(`sitePresentation.days.${day}`);
        return (
          <fieldset key={day} className="min-w-0 rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-sm font-semibold">{label}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <select className="input-field" aria-label={t("sitePresentation.dayStatus", { day: label })} value={setting?.status ?? ""}
                onChange={(event) => {
                  const status = event.target.value;
                  if (status === "open") change({ day, status, opens: "", closes: "" });
                  else if (status === "closed" || status === "appointment") change({ day, status });
                  else change();
                }}>
                {["", "open", "closed", "appointment"].map((status) => <option key={status} value={status}>{t(`sitePresentation.status.${status || "unset"}`)}</option>)}
              </select>
              {setting?.status === "open" && (["opens", "closes"] as const).map((field) => (
                <label key={field} className="min-w-0 text-sm text-gray-700">
                  {t(`sitePresentation.${field}`)}
                  <input type="time" className="input-field mt-1" value={setting[field]} required
                    onChange={(event) => change({ ...setting, [field]: event.target.value })} />
                </label>
              ))}
            </div>
            {setting?.status === "open" && setting.opens && setting.closes && !validMiniSiteHours(setting) && (
              <p className="mt-2 text-sm text-red-700">{t("sitePresentation.errors.hours")}</p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

export function ProfileFields({ type, profiles, onChange }: {
  type: "socials" | "externalReviews";
  profiles: MiniSiteProfile[];
  onChange: (profiles: MiniSiteProfile[]) => void;
}) {
  const { t } = useTranslation();
  const platforms = type === "socials" ? SOCIAL_PLATFORMS : REVIEW_PLATFORMS;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {platforms.map((platform) => {
        const current = profiles.find((entry) => entry.platform === platform);
        return (
          <label key={platform} className="min-w-0 text-sm font-medium text-gray-700">
            {t(`sitePresentation.platforms.${platform}`)}
            <input type="url" maxLength={SITE_CONTENT_LIMITS.link} className="input-field mt-1" placeholder="https://"
              value={current?.url ?? ""} onChange={(event) => {
                const url = event.target.value;
                onChange([...profiles.filter((entry) => entry.platform !== platform), ...(url.trim() ? [{ platform, url }] : [])]);
              }} />
            {current && !safeMiniSiteProfile(current) && (
              <span className="mt-1 block text-xs text-red-700">{t("sitePresentation.profileError")}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export function QuoteFields({ quote, onChange }: {
  quote: MiniSitePresentation["quote"];
  onChange: (quote: NonNullable<MiniSitePresentation["quote"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
      <legend className="px-1 font-semibold">{t("sitePresentation.quoteTitle")}</legend>
      <p className="text-sm text-gray-600">{t("sitePresentation.quoteHelp")}</p>
      <label className="block text-sm font-medium text-gray-700">
        {t("sitePresentation.quoteLabel")}
        <input className="input-field mt-1" maxLength={SITE_CONTENT_LIMITS.quoteLabel} value={quote?.label ?? ""}
          placeholder={t("sitePresentation.quoteDefault")} onChange={(event) => onChange({ ...quote, label: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        {t("sitePresentation.quoteText")}
        <textarea className="input-field mt-1" rows={2} maxLength={SITE_CONTENT_LIMITS.quoteText} value={quote?.text ?? ""}
          onChange={(event) => onChange({ ...quote, text: event.target.value })} />
      </label>
    </fieldset>
  );
}
