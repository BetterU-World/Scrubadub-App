import { useAction, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { resourceDeclaredMime } from "./resourceModel";
import { uploadResourceCandidate } from "./resourceTransfer";

export function useCanonicalResourceUpload() {
  const begin = useMutation((api as any).mutations.resourceUploadIntents.begin);
  const register = useMutation((api as any).mutations.resourceUploadIntents.registerCandidate);
  const cancel = useMutation((api as any).mutations.resourceUploadIntents.cancel);
  const finalize = useAction((api as any).resourceUploads.finalize);
  return async ({ file, signal, progress, validating, ...args }: {
    sessionToken: string; requestId: string; title: string; description?: string; file: File;
    resourceId?: string; expectedStorageId?: string; signal: AbortSignal;
    progress: (fraction: number) => void; validating: () => void;
  }): Promise<string> => {
    const declaredMimeType = resourceDeclaredMime(file);
    const intent = await begin({ ...args, originalFileName: file.name, declaredMimeType });
    if (intent.resourceId) return intent.resourceId;
    let storageId: string | null = intent.candidateStorageId;
    try {
      if (!storageId) {
        if (!intent.uploadUrl) throw new Error("Upload unavailable");
        storageId = await uploadResourceCandidate(intent.uploadUrl, file, declaredMimeType, intent.nonce, progress, signal);
        await register({ sessionToken: args.sessionToken, intentId: intent.intentId, storageId });
      }
      validating();
      return (await finalize({ sessionToken: args.sessionToken, intentId: intent.intentId, storageId })).resourceId;
    } catch (error) {
      try { await cancel({ sessionToken: args.sessionToken, intentId: intent.intentId, storageId: storageId ?? undefined }); }
      catch { /* Bounded expiry and exact-intent reconciliation remain authoritative. */ }
      throw error;
    }
  };
}
