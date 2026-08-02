import { Camera, CheckCircle2, Circle, ClipboardCheck, Clock, MapPin, Users } from "lucide-react";
import { StatusBadge } from "../components/ui/StatusBadge";

export interface ShowcaseWorkerJobPreviewModel {
  propertyName: string;
  address: string;
  scheduleLabel: string;
  jobTypeLabel: string;
  status: string;
  teamLabel?: string;
  completedChecklistItems: number;
  totalChecklistItems: number;
  checklistItems: Array<{ id: string; label: string; completed: boolean }>;
  completedPhotoCount?: number;
  reviewState?: string;
}

export function ShowcaseWorkerJobPreview({ model }: { model: ShowcaseWorkerJobPreviewModel }) {
  const progress = Math.round((model.completedChecklistItems / model.totalChecklistItems) * 100);
  return <section className="overflow-hidden rounded-xl border border-primary-100 bg-white shadow-sm" aria-labelledby="showcase-current-job">
    <div className="bg-primary-600 px-4 py-4 text-white sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">Current assignment</p><h2 id="showcase-current-job" className="mt-1 text-xl font-bold">{model.propertyName}</h2><p className="mt-1 text-sm text-primary-100">{model.jobTypeLabel}</p></div><div className="flex-none self-start"><StatusBadge status={model.status as any} /></div></div></div>
    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]"><div className="space-y-4"><div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2"><p className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" />{model.scheduleLabel}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-none text-gray-400" /><span>{model.address}</span></p>{model.teamLabel && <p className="flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" />{model.teamLabel}</p>}</div><div><div className="mb-2 flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><ClipboardCheck className="h-4 w-4 text-primary-600" />Cleaning checklist</p><span className="text-sm font-medium text-gray-600">{model.completedChecklistItems} of {model.totalChecklistItems}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} /></div><div className="mt-3 space-y-2">{model.checklistItems.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{item.completed ? <CheckCircle2 className="h-4 w-4 flex-none text-green-600" /> : <Circle className="h-4 w-4 flex-none text-gray-400" />}<span>{item.label}</span></div>)}</div></div></div>
      <div className="space-y-3"><div className="rounded-lg bg-blue-50 p-4"><div className="flex items-center gap-2 text-blue-800"><Camera className="h-5 w-5" /><p className="font-semibold">Completed-cleaning photos</p></div><p className="mt-2 text-2xl font-bold text-blue-950">{model.completedPhotoCount ?? 0}</p><p className="mt-1 text-xs text-blue-700">Photos attached to this cleaning form</p></div>{model.reviewState && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Submission status</p><p className="mt-1 text-sm font-medium text-amber-900">{model.reviewState}</p></div>}</div>
    </div>
  </section>;
}
