import { useTranslation } from "react-i18next";

const topicLabels = {
  "property-setup": "learningCenter.propertiesGuide",
  "cleaner-invitations": "learningCenter.teamGuide",
  "job-scheduling": "learningCenter.jobsGuide",
  calendar: "learningCenter.calendarGuide",
  "quality-review": "learningCenter.reviewGuide",
  troubleshooting: "learningCenter.troubleshooting",
};

export function OwnerGuideLink({ topic, newTab = false }: { topic: keyof typeof topicLabels; newTab?: boolean }) {
  const { t } = useTranslation();
  return (
    <a
      href={`/manuals/owner#${topic}`}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4"
    >
      {t(topicLabels[topic])}{newTab && <> {t("learningCenter.opensInNewTab")}</>}
    </a>
  );
}
