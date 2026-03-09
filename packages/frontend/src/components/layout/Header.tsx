import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 md:hidden">
          <img src="/favicon-96x96.png" alt="SCRUB" className="w-6 h-6" />
          <h1 className="text-xl font-extrabold text-primary-700 font-logo tracking-[0.06em]">SCRUB</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <NotificationBell />
        <button
          onClick={signOut}
          className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
