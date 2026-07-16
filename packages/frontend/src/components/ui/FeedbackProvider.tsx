import * as Toast from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  Dispatch,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { normalizeFeedbackMessage } from "@/lib/feedbackMessage";

export type FeedbackTone = "success" | "error" | "warning" | "info";

type FeedbackOptions = { duration?: never };
type FeedbackItem = { id: number; message: string; tone: FeedbackTone };
type FeedbackApi = Record<
  FeedbackTone,
  (message: string, options?: FeedbackOptions) => void
>;

const MAX_VISIBLE = 3;
const DURATIONS: Record<FeedbackTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 8000,
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

const toneStyles: Record<FeedbackTone, string> = {
  success: "border-green-200 bg-white text-green-800",
  error: "border-red-200 bg-white text-red-800",
  warning: "border-amber-200 bg-white text-amber-900",
  info: "border-blue-200 bg-white text-blue-800",
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((tone: FeedbackTone, message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    setItems((current) => {
      if (current.some((item) => item.tone === tone && item.message === normalized)) {
        return current;
      }
      return [
        ...current,
        { id: ++nextId.current, message: normalized, tone },
      ].slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (message) =>
        notify("success", normalizeFeedbackMessage(message, t("feedback.defaultSuccess"))),
      error: (message) =>
        notify("error", normalizeFeedbackMessage(message, t("feedback.unexpectedError"))),
      warning: (message) =>
        notify("warning", normalizeFeedbackMessage(message, t("feedback.defaultWarning"))),
      info: (message) =>
        notify("info", normalizeFeedbackMessage(message, t("feedback.defaultInfo"))),
    }),
    [notify, t]
  );

  return (
    <FeedbackContext.Provider value={api}>
      <Toast.Provider swipeDirection="right">
        {children}
        {items.map((item) => {
          const Icon = icons[item.tone];
          const label = t(`feedback.${item.tone}`);
          return (
            <Toast.Root
              key={item.id}
              open
              duration={DURATIONS[item.tone]}
              type={
                item.tone === "error" || item.tone === "warning"
                  ? "foreground"
                  : "background"
              }
              onOpenChange={(open) => !open && dismiss(item.id)}
              className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border px-4 py-3 shadow-lg data-[state=closed]:opacity-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] ${toneStyles[item.tone]}`}
            >
              <Icon aria-hidden="true" className="mt-0.5 h-5 w-5" />
              <div className="min-w-0">
                <Toast.Title className="text-sm font-semibold">{label}</Toast.Title>
                <Toast.Description className="mt-0.5 break-words text-sm text-gray-700">
                  {item.message}
                </Toast.Description>
              </div>
              <Toast.Close asChild>
                <button
                  type="button"
                  aria-label={t("feedback.closeNotification")}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </Toast.Close>
            </Toast.Root>
          );
        })}
        <Toast.Viewport className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+2.75rem)] z-[110] flex max-h-[calc(100dvh-4rem)] flex-col gap-2 outline-none sm:inset-x-auto sm:right-4 sm:w-[24rem]" />
      </Toast.Provider>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("useFeedback must be used within FeedbackProvider");
  return feedback;
}

/** Mechanical migration bridge for former local setToast call sites. */
export function useFeedbackSetter<
  T extends { message: string; type: "success" | "error" },
>(): Dispatch<SetStateAction<T | null>> {
  const feedback = useFeedback();
  return useCallback(
    (next) => {
      if (!next || typeof next === "function") return;
      if (next.type === "error") {
        feedback.error(toFriendlyMessage(next.message));
      } else {
        feedback.success(next.message);
      }
    },
    [feedback]
  );
}

export function useFeedbackState<
  T extends { message: string; type: "success" | "error" },
>(): [T | null, Dispatch<SetStateAction<T | null>>] {
  return [null, useFeedbackSetter<T>()];
}

export function useSimpleFeedbackState(): [
  string | null,
  Dispatch<SetStateAction<string | null>>,
] {
  const feedback = useFeedback();
  const setter = useCallback<Dispatch<SetStateAction<string | null>>>(
    (next) => {
      if (!next || typeof next === "function") return;
      if (/fail|error|unable|could not|couldn.t|unexpected|not sent|denied/i.test(next)) {
        feedback.error(toFriendlyMessage(next));
      } else {
        feedback.success(next);
      }
    },
    [feedback]
  );
  return [null, setter];
}
