import { useAuth } from "./useAuth";

export function useCompany() {
  const { user } = useAuth();
  return {
    companyId: user?.companyId ?? null,
    companyName: user?.companyName ?? "",
    isOwner: user?.role === "owner",
    isCleaner: user?.role === "cleaner",
  };
}
