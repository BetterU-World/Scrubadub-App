import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseOptionalCustomerChargeCents } from "@/lib/customerCharge";
import { JobCreationModeSelector } from "@/components/owner/JobCreationModeSelector";

const jobTypes = ["standard", "deep_clean", "turnover", "move_in_out", "post_construction", "maintenance"] as const;

export function QuickJobPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const canManage = user?.role === "owner" || user?.canManageClients === true;
  const canAssign = user?.role === "owner" || user?.canAssignCleaners === true;
  const properties = useQuery(api.queries.properties.list, user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip");
  const assignees = useQuery(api.queries.employees.getJobAssignees, user?.companyId && canAssign ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip");
  const teams = useQuery(api.queries.teams.listActiveForAssignment, user?.companyId && canAssign ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip");
  const create = useMutation(api.mutations.jobs.createQuick);
  const [newLocation, setNewLocation] = useState(false);
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState<"residential" | "commercial" | "vacation_rental" | "office">("residential");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [updateContact, setUpdateContact] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(120);
  const [type, setType] = useState<typeof jobTypes[number]>("standard");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [teamId, setTeamId] = useState("");
  const [charge, setCharge] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matching = (properties ?? []).filter(p => p.active && `${p.name} ${p.address} ${p.contactName ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.companyId || (!newLocation && !propertyId)) { setError(t("quick.chooseLocation")); return; }
    const cents = parseOptionalCustomerChargeCents(charge);
    if (cents === null) { setError(t("quick.invalidCharge")); return; }
    setBusy(true); setError("");
    try {
      const id = await create({
        userId: user._id, sessionToken, companyId: user.companyId,
        ...(newLocation ? { newProperty: { address, name: name || undefined, type: propertyType } } : { propertyId: propertyId as Id<"properties"> }),
        contact: { name: contactName || undefined, phone: contactPhone || undefined, email: contactEmail || undefined },
        updatePropertyContact: !newLocation && canManage && updateContact,
        customerChargeCents: cents, cleanerIds: workerIds as Id<"users">[], assignedTeamId: teamId ? teamId as Id<"teams"> : undefined,
        type, scheduledDate: date, startTime: time || undefined, durationMinutes: duration, notes: notes || undefined,
      });
      navigate(`/jobs/${id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("jobs.failedToSave")); }
    finally { setBusy(false); }
  };

  return <div className="max-w-2xl mx-auto min-w-0">
    <PageHeader title={t("quick.quickJob")} back={{ href: "/jobs", label: t("navigation.backToJobs") }} />
    <JobCreationModeSelector mode="quick" />
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <form onSubmit={submit} className="card space-y-4 min-w-0">
      <div><label className="block text-sm font-medium mb-1">{t("quick.location")}</label><div className="flex flex-wrap gap-2">
        <button type="button" className={!newLocation ? "btn-primary" : "btn-secondary"} onClick={() => setNewLocation(false)}>{t("quick.existingLocation")}</button>
        {canManage && <button type="button" className={newLocation ? "btn-primary" : "btn-secondary"} onClick={() => setNewLocation(true)}>{t("quick.newLocation")}</button>}
      </div></div>
      {newLocation ? <div className="space-y-3">
        <input className="input-field w-full" aria-label={t("quick.address")} placeholder={t("quick.address")} value={address} onChange={e => setAddress(e.target.value)} required />
        <input className="input-field w-full" aria-label={t("quick.locationName")} placeholder={t("quick.locationName")} value={name} onChange={e => setName(e.target.value)} />
        <select className="input-field w-full" aria-label={t("quick.propertyType")} value={propertyType} onChange={e => setPropertyType(e.target.value as typeof propertyType)}>{(["residential", "commercial", "vacation_rental", "office"] as const).map(value => <option key={value} value={value}>{t(`properties.propertyTypes.${value}`)}</option>)}</select>
      </div> : <div className="space-y-2">
        <input className="input-field w-full" aria-label={t("quick.searchLocations")} placeholder={t("quick.searchLocations")} value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">{matching.map(p => <button type="button" key={p._id} onClick={() => { setPropertyId(p._id); setContactName(p.contactName ?? ""); setContactPhone(p.contactPhone ?? ""); setContactEmail(p.contactEmail ?? ""); setUpdateContact(false); }} className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 ${propertyId === p._id ? "bg-primary-50" : ""}`}><span className="font-medium">{p.name}</span><span className="ml-2 text-xs">{t(`quick.${p.managementStatus ?? "managed"}`)}</span><span className="block text-sm text-gray-500 break-words">{p.address}{p.contactName ? ` · ${p.contactName}` : ""}</span></button>)}</div>
      </div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><input className="input-field" aria-label={t("quick.contactName")} placeholder={t("quick.contactName")} value={contactName} onChange={e => setContactName(e.target.value)} /><input className="input-field" type="tel" aria-label={t("quick.contactPhone")} placeholder={t("quick.contactPhone")} value={contactPhone} onChange={e => setContactPhone(e.target.value)} /><input className="input-field" type="email" aria-label={t("quick.contactEmail")} placeholder={t("quick.contactEmail")} value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></div>
      {!newLocation && canManage && propertyId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={updateContact} onChange={e => setUpdateContact(e.target.checked)} />{t("quick.updateCurrentContact")}</label>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-sm">{t("jobForm.date")}<input className="input-field w-full mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} required /></label><label className="text-sm">{t("quick.time")}<input className="input-field w-full mt-1" type="time" value={time} onChange={e => setTime(e.target.value)} /></label><label className="text-sm">{t("jobForm.duration")}<input className="input-field w-full mt-1" type="number" min={1} value={duration} onChange={e => setDuration(Number(e.target.value))} required /></label></div>
      <label className="block text-sm">{t("jobForm.jobType")}<select className="input-field w-full mt-1" value={type} onChange={e => { setType(e.target.value as typeof type); setWorkerIds([]); }} >{jobTypes.map(value => <option key={value} value={value}>{t(`jobTypes.${value}`)}</option>)}</select></label>
      {canAssign && <div className="space-y-2"><label className="block text-sm font-medium">{t("quick.assignment")}</label><select className="input-field w-full" value={teamId} onChange={e => { setTeamId(e.target.value); setWorkerIds([]); }}><option value="">{t("quick.individualWorkers")}</option>{(teams ?? []).map(team => <option key={team._id} value={team._id}>{team.name}</option>)}</select>{!teamId && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{(assignees ?? []).map(worker => <label key={worker._id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={workerIds.includes(worker._id)} onChange={e => setWorkerIds(ids => e.target.checked ? [...ids, worker._id] : ids.filter(id => id !== worker._id))} />{worker.name}</label>)}</div>}</div>}
      <label className="block text-sm">{t("quick.customerCharge")}<input className="input-field w-full mt-1" type="number" min="0" step="0.01" value={charge} onChange={e => setCharge(e.target.value)} placeholder="0.00" /></label>
      <label className="block text-sm">{t("jobs.notesOptional")}<textarea className="input-field w-full mt-1" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="btn-primary w-full sm:w-auto" type="submit" disabled={busy}>{busy ? t("common.saving") : t("quick.createJob")}</button>
    </form>
  </div>;
}
