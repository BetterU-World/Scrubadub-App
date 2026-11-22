import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { EstimateInput } from "../../../../../convex/lib/smartEstimatePricing";
import { DialogShell } from "@/components/ui/DialogShell";
import { SmartEstimateFields } from "./SmartEstimateFields";
import type { EstimateAuth } from "./SmartEstimateBuilder";

type Profile = FunctionReturnType<typeof api.queries.smartEstimatePreview.profiles>[number];
type Editor = { kind: "create" } | { kind: "edit" | "duplicate" | "archive"; profile: Profile };

export function SmartPricingProfiles({ auth }: { auth: EstimateAuth }) {
  const access = useQuery(api.queries.smartEstimatePreview.access, auth);
  return access?.configuration ? <ProfileList auth={auth} /> : null;
}

function ProfileList({ auth }: { auth: EstimateAuth }) {
  const { t } = useTranslation();
  const profiles = useQuery(api.queries.smartEstimatePreview.profiles, auth);
  const [editor, setEditor] = useState<Editor>();
  return <section className="card mt-6 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{t("smartEstimates.profiles")}</h2>
      <button type="button" className="btn-secondary" onClick={() => setEditor({ kind: "create" })}>{t("smartEstimates.createProfile")}</button>
    </div>
    {!profiles && <p role="status">{t("smartEstimates.loading")}</p>}
    {profiles?.length === 0 && <p className="text-sm text-gray-600">{t("smartEstimates.noProfiles")}</p>}
    {profiles?.map(profile => <article key={profile.profileId} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="min-w-0"><p className="break-words font-semibold">{profile.name}</p>
        <p className="text-sm text-gray-600">{t(`smartEstimates.strategies.${profile.defaults.strategy}`)}</p></div>
      <div className="flex flex-wrap gap-2">
        {(["edit", "duplicate", "archive"] as const).map(kind => <button key={kind} type="button" className="btn-secondary text-sm"
          onClick={() => setEditor({ kind, profile })}>{t(`smartEstimates.${kind}Profile`)}</button>)}
      </div>
    </article>)}
    {editor && <ProfileEditor auth={auth} editor={editor} onClose={() => setEditor(undefined)} />}
  </section>;
}

function ProfileEditor({ auth, editor, onClose }: { auth: EstimateAuth; editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const existing = editor.kind !== "create" ? editor.profile : null;
  const [name, setName] = useState(editor.kind === "edit" ? editor.profile.name : "");
  const [defaults, setDefaults] = useState<EstimateInput>(existing?.defaults ?? { strategy: "flat", cadence: "one_time" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const change = useMutation(api.mutations.smartPricingProfiles.previewChange);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (editor.kind === "create") await change({ ...auth, operation: { kind: "create", name, defaults } });
      else {
        const identity = { profileId: editor.profile.profileId, expectedRevisionId: editor.profile.revisionId };
        switch (editor.kind) {
          case "edit": await change({ ...auth, operation: { ...identity, kind: "edit", name, defaults } }); break;
          case "duplicate": await change({ ...auth, operation: { ...identity, kind: "duplicate", name } }); break;
          case "archive": await change({ ...auth, operation: { ...identity, kind: "archive" } }); break;
        }
      }
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return <DialogShell open title={t(`smartEstimates.${editor.kind}Profile`)} onOpenChange={open => !open && onClose()} pending={busy}
    closeOnOutsideClick={false} className="max-w-xl"
    footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
      <button type="button" className="btn-primary" disabled={busy || (editor.kind !== "archive" && !name.trim())}
        onClick={() => void submit()}>{t(editor.kind === "archive" ? "smartEstimates.archiveProfile" : "common.save")}</button></>}>
    <fieldset disabled={busy} className="space-y-3">
      {editor.kind === "archive" ? <p>{t("smartEstimates.archiveHelp", { name: editor.profile.name })}</p> :
        <label className="block text-sm font-medium">{t("smartEstimates.profileName")}
          <input className="input-field mt-1" maxLength={100} value={name} onChange={event => setName(event.target.value)} />
        </label>}
      {(editor.kind === "create" || editor.kind === "edit") && <SmartEstimateFields input={defaults} onChange={setDefaults} />}
      {error && <p role="alert" className="text-sm text-red-700">{t("smartEstimates.profileFailed")}</p>}
    </fieldset>
  </DialogShell>;
}
