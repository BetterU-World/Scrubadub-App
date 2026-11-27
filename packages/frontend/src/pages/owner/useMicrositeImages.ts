import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MEDIA_LIMITS, mediaReferences, type MediaConfig, type MediaImage, type MediaPurpose } from "../../../../../convex/lib/micrositeMediaModel";
import { MediaPreparationError, prepareMicrositeImage, type PreparedImage } from "@/lib/prepareMicrositeImage";

type AssetId = Id<"micrositeMediaAssets">;
type Source = { url: string; width: number; height: number };
type Job = {
  file: File; status: "queued" | "preparing" | "uploading" | "failed"; error?: string;
  id: string; assetId?: AssetId; purpose: MediaPurpose; prepared?: PreparedImage;
  attempts: number; discardResult?: Promise<unknown>;
  complete: (image: MediaImage) => void;
};

export function useMicrositeImages(sessionToken: string, config: MediaConfig, loadSaved: "gallery" | "team" | "all" | false) {
  const begin = useMutation(api.micrositeMedia.begin);
  const discard = useMutation(api.micrositeMedia.discard);
  const upload = useAction(api.micrositeMediaFiles.upload);
  const fetchPreview = useAction(api.micrositeMediaFiles.preview);
  const jobs = useRef(new Map<string, Job>());
  const staged = useRef(new Set<AssetId>());
  const urls = useRef(new Map<AssetId, Source>());
  const failedPreviews = useRef(new Set<AssetId>());
  const mounted = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [, setRevision] = useState(0);
  const refresh = () => { if (mounted.current) setRevision((current) => current + 1); };
  const discardAsset = useCallback((assetId: AssetId) =>
    discard({ sessionToken, assetId }).catch(() => {}), [discard, sessionToken]);
  const discardJob = useCallback((job: Job) => {
    if (job.assetId) job.discardResult ??= discardAsset(job.assetId);
    return job.discardResult;
  }, [discardAsset]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const source of urls.current.values()) URL.revokeObjectURL(source.url);
      urls.current.clear();
      for (const job of jobs.current.values()) void discardJob(job);
      jobs.current.clear();
      for (const id of staged.current) void discardAsset(id);
      staged.current.clear();
      failedPreviews.current.clear();
    };
  }, [discardAsset, discardJob]);

  useEffect(() => {
    const active = new Set(mediaReferences(config).map(({ assetId }) => assetId));
    let freedSlot = false;
    for (const [id, value] of urls.current) {
      if (active.has(id)) continue;
      URL.revokeObjectURL(value.url);
      urls.current.delete(id);
      failedPreviews.current.delete(id);
      if (staged.current.delete(id)) {
        freedSlot = true;
        void discardAsset(id);
      }
    }
    if (freedSlot) refresh();
  }, [config, discardAsset]);

  useEffect(() => {
    if (!loadSaved || !sessionToken) return;
    let cancelled = false;
    const selected = { gallery: loadSaved === "team" ? [] : config.gallery, team: loadSaved === "gallery" ? [] : config.team };
    const ids = [...new Set(mediaReferences(selected).map(({ assetId }) => assetId))];
    const load = async () => {
      for (const assetId of ids) {
        if (cancelled) return;
        if (urls.current.has(assetId) || failedPreviews.current.has(assetId)) continue;
        try {
          const info = await fetchPreview({ sessionToken, assetId });
          if (cancelled) return;
          if (info) {
            const url = URL.createObjectURL(new Blob([info.data], { type: info.mime }));
            urls.current.set(assetId, { url, width: info.width, height: info.height });
          } else failedPreviews.current.add(assetId);
        } catch {
          if (cancelled) return;
          failedPreviews.current.add(assetId);
        }
        refresh();
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [config, fetchPreview, loadSaved, sessionToken]);

  const removeJob = (key: string) => {
    const job = jobs.current.get(key);
    if (!job) return;
    jobs.current.delete(key);
    void discardJob(job);
    refresh();
  };

  const run = (key: string, job: Job) => {
    const present = () => mounted.current && jobs.current.get(key) === job;
    queue.current = queue.current.then(async () => {
      if (!present()) return;
      try {
        job.attempts++;
        job.status = "preparing";
        refresh();
        job.prepared ??= await prepareMicrositeImage(job.file, job.purpose);
        if (!present()) return;
        job.status = "uploading";
        refresh();
        const ticket = await begin({ sessionToken, purpose: job.purpose, requestId: job.id, bytes: job.prepared.blob.size, mime: job.prepared.mime });
        job.assetId = ticket.assetId;
        if (!present()) {
          await discardJob(job);
          return;
        }
        let result = ticket.ready;
        if (!result) {
          const data = await job.prepared.blob.arrayBuffer();
          if (!present()) {
            await discardJob(job);
            return;
          }
          result = await upload({ sessionToken, assetId: ticket.assetId, data });
        }
        if (!present()) {
          await discardJob(job);
          return;
        }
        // Display the validated derivative, including any final server-side encoding.
        const verified = await fetchPreview({ sessionToken, assetId: result.assetId });
        if (!verified) throw new Error("Image preview unavailable.");
        if (!present()) {
          await discardJob(job);
          return;
        }
        const url = URL.createObjectURL(new Blob([verified.data], { type: verified.mime }));
        urls.current.set(result.assetId, { url, width: verified.width, height: verified.height });
        staged.current.add(result.assetId);
        jobs.current.delete(key);
        job.complete({ assetId: result.assetId, alt: "" });
      } catch (error) {
        if (!present()) {
          await discardJob(job);
          return;
        }
        if (job.attempts >= MEDIA_LIMITS.uploadClaims) await discardJob(job);
        if (!present()) return;
        job.status = "failed";
        job.error = error instanceof MediaPreparationError ? error.code
          : job.attempts >= MEDIA_LIMITS.uploadClaims ? "retryLimit" : "uploadFailed";
      } finally {
        refresh();
      }
    });
  };

  const choose = (key: string, file: File, purpose: MediaPurpose, complete: Job["complete"]) => {
    if (!jobs.current.has(key) && jobs.current.size + staged.current.size >= MEDIA_LIMITS.stages) return false;
    removeJob(key);
    const job: Job = { file, purpose, complete, id: crypto.randomUUID(), status: "queued", attempts: 0 };
    jobs.current.set(key, job);
    refresh();
    run(key, job);
    return true;
  };

  return {
    source: (id: AssetId) => urls.current.get(id),
    job: (key: string) => {
      const job = jobs.current.get(key);
      return job && { status: job.status, error: job.error, canRetry: job.attempts < MEDIA_LIMITS.uploadClaims };
    },
    remaining: Math.max(0, MEDIA_LIMITS.stages - jobs.current.size - staged.current.size),
    blocked: jobs.current.size > 0,
    choose, removeJob,
    hasJobForEntry: (id: string) => [...jobs.current.keys()].some((key) => key.startsWith(`${id}:`)),
    retry: (key: string) => {
      const job = jobs.current.get(key);
      if (job?.status !== "failed" || job.attempts >= MEDIA_LIMITS.uploadClaims) return;
      job.status = "queued";
      job.error = undefined;
      refresh();
      run(key, job);
    },
    markSaved: () => { staged.current.clear(); refresh(); },
  };
}

export type MicrositeImageEditor = ReturnType<typeof useMicrositeImages>;
