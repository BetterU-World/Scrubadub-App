import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";

export function ShowcaseActionNotice({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-gray-950/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-primary-50 p-2 text-primary-700">
              <Info className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold text-gray-950">
                Showcase mode
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-gray-600">
                This is a demonstration workspace, so this action won’t make any
                real changes.
              </Dialog.Description>
              <p className="mt-3 text-sm leading-6 text-gray-600">{detail}</p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <Dialog.Close className="btn-primary mt-5 w-full">
            Continue exploring
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
