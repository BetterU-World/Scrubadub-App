import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { AttachmentTarget } from "../../../../convex/lib/attachmentUploads";

/** Upload first, then pass the returned intent to the resource's committing mutation. */
export function useAttachmentUpload() {
  const begin = useMutation(api.attachmentUploads.begin);
  return async (target: AttachmentTarget, file: File, sessionToken: string) => {
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Attachment must be between 1 byte and 10 MB");
    const intent = await begin({ sessionToken, target, mimeType: file.type });
    const response = await fetch(intent.uploadUrl, { method: "POST", headers: { "Content-Type": intent.contentType }, body: file });
    if (!response.ok) throw new Error("Attachment upload failed");
    const body = await response.json() as { storageId?: Id<"_storage"> };
    if (!body.storageId) throw new Error("Attachment upload did not return a file");
    return { storageId: body.storageId, uploadIntentId: intent.intentId };
  };
}
