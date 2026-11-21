import { useTranslation } from "react-i18next";

const topicLabels = {
  "property-setup": "learningCenter.propertiesGuide",
  "cleaner-invitations": "learningCenter.teamGuide",
  "job-scheduling": "learningCenter.jobsGuide",
  calendar: "learningCenter.calendarGuide",
  "quality-review": "learningCenter.reviewGuide",
  troubleshooting: "learningCenter.troubleshooting",
};

export function OwnerGuideLink({ topic }: { topic: keyof typeof topicLabels }) {
  const { t } = useTranslation();
  return (
    <a
      href={`/manuals/owner#${topic}`}
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4"
    >
      {t(topicLabels[topic])}
    </a>
  );
}
