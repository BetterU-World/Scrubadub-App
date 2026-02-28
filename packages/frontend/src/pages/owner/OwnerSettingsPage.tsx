import { Link } from "wouter";
import { CreditCard, Building2, Bell, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const settingsItems = [
  {
    href: "/owner/settings/billing",
    label: "Billing & Stripe",
    description: "Manage Stripe Connect and payments",
    icon: CreditCard,
    enabled: true,
  },
  {
    href: "#",
    label: "Company Profile",
    description: "Coming soon",
    icon: Building2,
    enabled: false,
  },
  {
    href: "#",
    label: "Notifications",
    description: "Coming soon",
    icon: Bell,
    enabled: false,
  },
];

export function OwnerSettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="max-w-lg space-y-2">
        {settingsItems.map((item) =>
          item.enabled ? (
            <Link
              key={item.label}
              href={item.href}
              className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ) : (
            <div
              key={item.label}
              className="card flex items-center gap-4 opacity-50 cursor-not-allowed"
            >
              <div className="p-2 rounded-lg bg-gray-100 text-gray-400">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-400">{item.label}</p>
                <p className="text-sm text-gray-400">{item.description}</p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
