import {
  CalendarCheck,
  CheckCircle,
  XCircle,
  MapPinCheck,
  Play,
  Send,
  ThumbsUp,
  RotateCcw,
} from "lucide-react";

interface Job {
  _creationTime: number;
  status: string;
  acceptedAt?: number;
  deniedAt?: number;
  arrivedAt?: number;
  startedAt?: number;
  completedAt?: number;
  reworkCount: number;
}

interface TimelineEvent {
  label: string;
  time: number;
  icon: React.ReactNode;
  color: string;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  }) + " at " + d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function JobTimeline({ job }: { job: Job }) {
  const events: TimelineEvent[] = [];

  events.push({
    label: "Scheduled",
    time: job._creationTime,
    icon: <CalendarCheck className="w-4 h-4" />,
    color: "text-blue-600 bg-blue-100",
  });

  if (job.acceptedAt) {
    events.push({
      label: "Accepted",
      time: job.acceptedAt,
      icon: <CheckCircle className="w-4 h-4" />,
      color: "text-indigo-600 bg-indigo-100",
    });
  }

  if (job.deniedAt) {
    events.push({
      label: "Denied",
      time: job.deniedAt,
      icon: <XCircle className="w-4 h-4" />,
      color: "text-red-600 bg-red-100",
    });
  }

  if (job.arrivedAt) {
    events.push({
      label: "Arrived",
      time: job.arrivedAt,
      icon: <MapPinCheck className="w-4 h-4" />,
      color: "text-cyan-600 bg-cyan-100",
    });
  }

  if (job.startedAt) {
    events.push({
      label: "Started",
      time: job.startedAt,
      icon: <Play className="w-4 h-4" />,
      color: "text-purple-600 bg-purple-100",
    });
  }

  if (job.completedAt && (job.status === "submitted" || job.status === "rework_requested")) {
    events.push({
      label: "Submitted",
      time: job.completedAt,
      icon: <Send className="w-4 h-4" />,
      color: "text-teal-600 bg-teal-100",
    });
  }

  if (job.completedAt && job.status === "approved") {
    events.push({
      label: "Submitted",
      time: job.completedAt,
      icon: <Send className="w-4 h-4" />,
      color: "text-teal-600 bg-teal-100",
    });
    events.push({
      label: "Approved",
      time: job.completedAt,
      icon: <ThumbsUp className="w-4 h-4" />,
      color: "text-green-600 bg-green-100",
    });
  }

  if (job.status === "rework_requested") {
    events.push({
      label: `Rework #${job.reworkCount}`,
      time: job.completedAt ?? Date.now(),
      icon: <RotateCcw className="w-4 h-4" />,
      color: "text-orange-600 bg-orange-100",
    });
  }

  if (events.length <= 1) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Timeline</h3>
      <ol className="relative border-l border-gray-200 ml-2 space-y-3">
        {events.map((e, i) => (
          <li key={i} className="ml-4">
            <span
              className={`absolute -left-[11px] flex items-center justify-center w-[22px] h-[22px] rounded-full ring-2 ring-white ${e.color}`}
            >
              {e.icon}
            </span>
            <p className="text-sm font-medium text-gray-900">{e.label}</p>
            <p className="text-xs text-gray-500">{fmtTime(e.time)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
