import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Home,
  MapPin,
  Users,
  Wrench,
} from "lucide-react";

type JobStatus = "In Progress" | "Ready Next" | "Scheduled";

interface MarketingJob {
  propertyName: string;
  serviceType: string;
  scheduleLabel: string;
  location: string;
  status: JobStatus;
  worker: string;
}

export const brightSideMarketingFixture = {
  companyName: "BrightSide Cleaning Co.",
  workerName: "Elena",
  clientName: "Sarah Johnson",
  providerName: "BrightSide Cleaning Co.",
  primaryProperty: "Riverstone Retreat",
  jobs: [
    { propertyName: "Riverstone Retreat", serviceType: "Turnover Cleaning", scheduleLabel: "Today · 9:00 AM", location: "Asheville, NC", status: "In Progress", worker: "Elena" },
    { propertyName: "Linden House", serviceType: "Recurring Cleaning", scheduleLabel: "Today · 1:30 PM", location: "Asheville, NC", status: "Ready Next", worker: "Maya" },
    { propertyName: "Cedar Ridge Cabin", serviceType: "Turnover Cleaning", scheduleLabel: "Tomorrow · 10:00 AM", location: "Black Mountain, NC", status: "Scheduled", worker: "Elena" },
  ] satisfies MarketingJob[],
  checklist: [
    { label: "Kitchen and dining", completed: true },
    { label: "Bedrooms and linens", completed: true },
    { label: "Bathrooms", completed: false },
    { label: "Final walkthrough", completed: false },
  ],
} as const;

const frameClass = "overflow-hidden rounded-[1.25rem] border border-slate-200/90 bg-white shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)]";

function BrowserChrome({ label }: { label: string }) {
  return <div className="flex h-9 items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3">
    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
    <span className="ml-2 truncate text-[10px] font-medium text-slate-400">{label}</span>
  </div>;
}

function ScrubMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-600 text-[11px] font-black text-white">S</span>{!compact && <span className="text-xs font-bold tracking-[0.14em] text-slate-900">SCRUB</span>}</div>;
}

function StatusPill({ status }: { status: JobStatus }) {
  const colors = status === "In Progress" ? "bg-blue-50 text-blue-700" : status === "Ready Next" ? "bg-amber-50 text-amber-700" : "bg-primary-50 text-primary-700";
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-semibold ${colors}`}>{status}</span>;
}

function MetricCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: typeof Home; tone?: "primary" | "alert" }) {
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm sm:p-3">
    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === "alert" ? "bg-rose-50 text-rose-600" : "bg-primary-50 text-primary-700"}`}><Icon className="h-3.5 w-3.5" /></div>
    <p className="mt-2 text-lg font-bold leading-none text-slate-900 sm:text-xl">{value}</p><p className="mt-1 min-h-6 text-[8px] font-medium leading-3 text-slate-500 sm:text-[9px]">{label}</p>
  </div>;
}

export function MarketingOwnerDashboard() {
  return <figure aria-label="Illustration of an established BrightSide Cleaning Co. owner workspace with active jobs and operational alerts." className={frameClass}>
    <div aria-hidden="true"><BrowserChrome label="Example SCRUB workspace" />
      <div className="grid bg-slate-50/70 sm:grid-cols-[5.5rem_1fr]">
        <aside className="hidden border-r border-slate-100 bg-white p-3 sm:block"><ScrubMark compact /><div className="mt-6 space-y-2">{[Home, CalendarDays, Users, ClipboardCheck].map((Icon, index) => <div key={index} className={`grid h-8 w-8 place-items-center rounded-lg ${index === 0 ? "bg-primary-50 text-primary-700" : "text-slate-300"}`}><Icon className="h-4 w-4" /></div>)}</div></aside>
        <div className="min-w-0 p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary-700">Owner workspace</p><h3 className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{brightSideMarketingFixture.companyName}</h3><p className="mt-0.5 text-[9px] text-slate-500 sm:text-[10px]">Monday operations overview</p></div><ScrubMark compact /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5"><MetricCard label="Active properties" value="12" icon={Building2} /><MetricCard label="Team members" value="6" icon={Users} /><MetricCard label="Active jobs" value="4" icon={ClipboardCheck} /><div className="hidden sm:block"><MetricCard label="Open red flags" value="2" icon={AlertTriangle} tone="alert" /></div><div className="hidden sm:block"><MetricCard label="Awaiting approval" value="3" icon={Clock3} /></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-800 sm:text-xs">Upcoming jobs</p><span className="text-[9px] font-semibold text-primary-700">Today</span></div><div className="mt-2 divide-y divide-slate-100">{brightSideMarketingFixture.jobs.slice(0, 2).map(job => <div key={job.propertyName} className="flex items-center gap-2 py-2"><span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700"><Home className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-800">{job.propertyName}</p><p className="truncate text-[9px] text-slate-500">{job.scheduleLabel} · {job.worker}</p></div><StatusPill status={job.status} /></div>)}</div></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1"><div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3"><AlertTriangle className="h-4 w-4 text-rose-600" /><p className="mt-2 text-base font-bold text-slate-900">2</p><p className="text-[9px] font-medium text-slate-600">Recent red flags</p></div><div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3"><Wrench className="h-4 w-4 text-amber-600" /><p className="mt-2 text-base font-bold text-slate-900">3</p><p className="text-[9px] font-medium text-slate-600">Maintenance items</p></div></div>
          </div>
        </div>
      </div>
    </div>
  </figure>;
}

export function MarketingOwnerJobs() {
  return <figure aria-label="Illustration of BrightSide Cleaning Co.'s operating schedule with Riverstone Retreat and other upcoming jobs." className={frameClass}>
    <div aria-hidden="true"><BrowserChrome label="Owner · Jobs" /><div className="bg-slate-50/70 p-3 sm:p-5">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold text-primary-700">BRIGHTSIDE CLEANING CO.</p><h3 className="mt-1 text-xl font-bold text-slate-900">Jobs</h3></div><div className="hidden items-center gap-2 sm:flex"><ScrubMark compact /><span className="text-[10px] font-semibold text-slate-500">Operating schedule</span></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2">{[["Today", "2"], ["In Progress", "1"], ["Ready Next", "1"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[9px] font-medium text-slate-500 sm:text-[10px]">{label}</p></div>)}</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><p className="text-xs font-bold text-slate-800">Today&apos;s schedule</p><p className="text-[9px] text-slate-400">Monday</p></div>{brightSideMarketingFixture.jobs.map((job, index) => <div key={job.propertyName} className={`${index === 2 ? "hidden sm:flex" : "flex"} items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-0`}><div className="w-12 flex-none text-center"><p className="text-[10px] font-bold text-slate-800">{job.scheduleLabel.split(" · ")[1]}</p><p className="text-[8px] text-slate-400">{index === 2 ? "Tomorrow" : "Today"}</p></div><span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700"><Building2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-slate-900">{job.propertyName}</p><p className="truncate text-[9px] text-slate-500">{job.serviceType} · {job.location}</p></div><div className="hidden text-right sm:block"><p className="text-[9px] font-semibold text-slate-700">{job.worker}</p><p className="text-[8px] text-slate-400">Assigned</p></div><StatusPill status={job.status} /></div>)}</div>
    </div></div>
  </figure>;
}

function MobileSurface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-[0_28px_70px_-38px_rgba(15,23,42,.5)] ${className}`}>{children}</div>;
}

function MobileHeader({ title }: { title: string }) {
  return <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><ScrubMark /><span className="text-[9px] font-semibold text-slate-400">{title}</span></div>;
}

export function MarketingWorkerWorkspace() {
  const job = brightSideMarketingFixture.jobs[0];
  return <figure aria-label="Illustration of Elena's Worker Home beside the readable Riverstone Retreat job checklist." className="mx-auto w-full max-w-[34rem]">
    <div aria-hidden="true" className="grid items-start gap-4 min-[440px]:grid-cols-[1.05fr_.95fr] min-[440px]:gap-3 sm:gap-5">
      <MobileSurface className="relative z-10 min-w-0"><MobileHeader title="WORKER HOME" /><div className="p-4"><p className="text-[10px] font-medium text-primary-700">{brightSideMarketingFixture.companyName}</p><h3 className="mt-1 text-xl font-bold text-slate-900">Good morning, {brightSideMarketingFixture.workerName}</h3><p className="mt-1 text-[10px] text-slate-500">Here&apos;s what&apos;s happening today.</p><div className="mt-4 rounded-2xl bg-slate-900 p-4 text-white"><div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-semibold uppercase tracking-wider text-primary-300">Current assignment</p><h4 className="mt-1 text-base font-bold">{job.propertyName}</h4></div><StatusPill status={job.status} /></div><p className="mt-1 text-[10px] text-slate-300">{job.serviceType}</p><div className="mt-4 space-y-2 text-[10px] text-slate-200"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-primary-300" />{job.scheduleLabel}</p><p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary-300" />{job.location}</p></div></div><div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Needs attention</p><p className="mt-1 text-[10px] font-medium text-slate-700">Review access instructions before arrival.</p></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-slate-100 p-3"><ClipboardCheck className="h-4 w-4 text-primary-700" /><p className="mt-2 text-[10px] font-semibold">My jobs</p><p className="text-[9px] text-slate-400">2 scheduled</p></div><div className="rounded-xl border border-slate-100 p-3"><CalendarDays className="h-4 w-4 text-primary-700" /><p className="mt-2 text-[10px] font-semibold">Schedule</p><p className="text-[9px] text-slate-400">This week</p></div></div></div><div className="grid grid-cols-3 border-t border-slate-100 px-3 py-3 text-center text-[8px] font-semibold text-slate-400"><span className="text-primary-700">Home</span><span>Jobs</span><span>Profile</span></div></MobileSurface>
      <MobileSurface className="min-w-0 min-[440px]:mt-14"><MobileHeader title="JOB DETAIL" /><div className="p-4"><StatusPill status={job.status} /><h4 className="mt-3 text-lg font-bold text-slate-900">{job.propertyName}</h4><p className="text-[10px] text-slate-500">{job.serviceType}</p><div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-[9px] text-slate-600"><p className="flex gap-2"><CalendarDays className="h-3.5 w-3.5 flex-none text-primary-700" />Today · 9:00 AM–12:00 PM</p><p className="flex gap-2"><MapPin className="h-3.5 w-3.5 flex-none text-primary-700" />128 Riverstone Lane, Asheville</p><p className="flex gap-2"><Home className="h-3.5 w-3.5 flex-none text-primary-700" />Access instructions available</p></div><div className="mt-4 flex items-center justify-between"><p className="text-[11px] font-bold text-slate-800">Cleaning checklist</p><p className="text-[9px] font-semibold text-primary-700">2 of 4</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 rounded-full bg-primary-600" /></div><ul className="mt-3 space-y-2">{brightSideMarketingFixture.checklist.map(item => <li key={item.label} className="flex items-center gap-2 text-[9px] text-slate-600"><span className={`grid h-4 w-4 flex-none place-items-center rounded-full ${item.completed ? "bg-primary-600 text-white" : "border border-slate-200"}`}>{item.completed && <Check className="h-2.5 w-2.5" />}</span>{item.label}</li>)}</ul><div className="mt-4 rounded-xl border border-primary-100 bg-primary-50 p-3"><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary-700" /><p className="text-[10px] font-semibold text-slate-800">Completed-cleaning photos</p></div><p className="mt-1 text-[9px] text-slate-500">Add photos before submitting for review.</p></div><p className="mt-3 text-center text-[9px] font-semibold text-slate-400">Submission not ready</p></div></MobileSurface>
    </div>
  </figure>;
}

export function MarketingClientPortal() {
  return <figure aria-label="Illustration of Sarah Johnson's BrightSide client portal and a readable scheduled-request timeline." className="w-full">
    <div aria-hidden="true" className="relative pb-3 sm:pb-12"><div className={frameClass}><BrowserChrome label="Client Portal" /><div className="bg-slate-50/70 p-3 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold text-primary-700">CLIENT PORTAL</p><h3 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">Welcome, {brightSideMarketingFixture.clientName}</h3><p className="mt-1 text-[9px] text-slate-500">Service provided by {brightSideMarketingFixture.providerName}</p></div><ScrubMark compact /></div><div className="mt-4 rounded-xl border border-primary-100 bg-white p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-semibold uppercase tracking-wide text-primary-700">Upcoming service</p><h4 className="mt-1 text-sm font-bold text-slate-900">{brightSideMarketingFixture.primaryProperty}</h4><p className="mt-1 text-[9px] text-slate-500">Turnover Cleaning</p></div><span className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-semibold text-primary-700">Confirmed</span></div><div className="mt-3 grid gap-2 text-[9px] text-slate-600 sm:grid-cols-2"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-primary-700" />Monday · 9:00 AM</p><p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary-700" />Asheville, NC</p></div></div><div className="mt-3 grid grid-cols-3 gap-2">{[["Requests", "1 active"], ["Locations", "2 saved"], ["Documents", "Available"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-white p-2.5"><p className="text-[9px] font-semibold text-slate-700">{label}</p><p className="mt-1 text-[8px] text-slate-400">{value}</p></div>)}</div></div></div>
      <div className="relative z-10 mx-auto -mt-2 w-[94%] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_24px_55px_-32px_rgba(15,23,42,.5)] sm:absolute sm:-bottom-1 sm:right-5 sm:mt-0 sm:w-[64%] sm:max-w-sm"><div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold text-primary-700">SERVICE REQUEST</p><p className="mt-0.5 text-xs font-bold text-slate-900">Riverstone schedule update</p></div><span className="rounded-full bg-primary-50 px-2 py-1 text-[8px] font-semibold text-primary-700">Scheduled</span></div><div className="mt-3 space-y-2">{[["Requested", "Preferred: Monday morning"], ["Under Review", "Schedule reviewed by BrightSide"], ["Scheduled", "Monday · 9:00 AM"]].map(([label, detail], index) => <div key={label} className="flex gap-2"><span className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full ${index < 3 ? "bg-primary-600 text-white" : "border border-slate-200"}`}><Check className="h-2.5 w-2.5" /></span><div><p className="text-[9px] font-semibold text-slate-700">{label}</p><p className="text-[8px] leading-4 text-slate-400">{detail}</p></div></div>)}</div><div className="mt-3 flex items-center gap-2 rounded-lg bg-primary-50 p-2"><CheckCircle2 className="h-4 w-4 flex-none text-primary-700" /><p className="text-[8px] font-medium text-slate-600">Your service is confirmed for Monday at 9:00 AM.</p></div></div>
    </div>
  </figure>;
}
