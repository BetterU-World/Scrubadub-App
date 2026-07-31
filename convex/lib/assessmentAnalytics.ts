type Attempt = {
  _id: unknown;
  status: "in_progress" | "completed" | "abandoned" | "deleted";
  startedAt: number;
  completedAt?: number;
};

type Event = {
  attemptId?: unknown;
  eventKey: string;
  createdAt: number;
  metadata?: {
    deviceCategory?: "mobile" | "desktop";
    sectionKey?: string;
    questionKey?: string;
    sessionId?: string;
  };
};

const rate = (numerator: number, denominator: number) =>
  denominator ? Math.round(numerator * 1000 / denominator) / 10 : 0;

const average = (values: number[]) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10 / values.length) / 10 : null;

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
};

function countedEvents(events: Event[], eventKey: string) {
  return new Set(events.filter((event) => event.eventKey === eventKey && event.attemptId).map((event) => String(event.attemptId)));
}

function ranked(values: Array<string | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 8);
}

function utcDay(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function aggregateAssessmentAnalytics(attempts: Attempt[], events: Event[], now = Date.now()) {
  const active = attempts.filter((attempt) => attempt.status !== "deleted");
  const completed = active.filter((attempt) => attempt.status === "completed");
  const abandoned = active.filter((attempt) => attempt.status === "abandoned");
  const completedIds = new Set(completed.map((attempt) => String(attempt._id)));
  const durations = completed
    .filter((attempt) => attempt.completedAt !== undefined)
    .map((attempt) => Math.max(0, attempt.completedAt! - attempt.startedAt));
  const startEvents = events.filter((event) => event.eventKey === "assessment_started" && event.attemptId);
  const deviceByAttempt = new Map(startEvents.map((event) => [String(event.attemptId), event.metadata?.deviceCategory]));
  const progressByAttempt = new Map<string, Event>();
  for (const event of events.filter((item) => item.eventKey === "assessment_progress" && item.attemptId)) {
    const key = String(event.attemptId);
    if (!progressByAttempt.has(key) || progressByAttempt.get(key)!.createdAt < event.createdAt) progressByAttempt.set(key, event);
  }
  const abandonedProgress = abandoned.map((attempt) => progressByAttempt.get(String(attempt._id)));
  const resumed = countedEvents(events, "assessment_resumed");
  const returned = countedEvents(events, "secure_return_opened");
  const ctaClicks = countedEvents(events, "scrub_support_cta_clicked");
  const interestSubmissions = countedEvents(events, "scrub_interest_submitted");
  const sessions = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.attemptId || !event.metadata?.sessionId || !["assessment_started", "assessment_resumed"].includes(event.eventKey)) continue;
    const key = String(event.attemptId);
    const current = sessions.get(key) ?? new Set<string>();
    current.add(event.metadata.sessionId);
    sessions.set(key, current);
  }
  const completedSessionCounts = completed.map((attempt) => sessions.get(String(attempt._id))?.size).filter((value): value is number => Boolean(value));
  const devices = (["mobile", "desktop"] as const).map((deviceCategory) => {
    const starts = active.filter((attempt) => deviceByAttempt.get(String(attempt._id)) === deviceCategory).length;
    const completions = completed.filter((attempt) => deviceByAttempt.get(String(attempt._id)) === deviceCategory).length;
    return { deviceCategory, starts, completions, completionRate: rate(completions, starts) };
  });
  const dayStart = utcDay(now - 13 * 24 * 60 * 60 * 1000);
  const days = new Map<string, { day: string; starts: number; completions: number }>();
  for (const attempt of active) {
    const startDay = utcDay(attempt.startedAt);
    if (startDay >= dayStart) {
      const row = days.get(startDay) ?? { day: startDay, starts: 0, completions: 0 };
      row.starts++;
      days.set(startDay, row);
    }
    if (attempt.completedAt) {
      const completedDay = utcDay(attempt.completedAt);
      if (completedDay >= dayStart) {
        const row = days.get(completedDay) ?? { day: completedDay, starts: 0, completions: 0 };
        row.completions++;
        days.set(completedDay, row);
      }
    }
  }

  return {
    funnel: {
      starts: active.length,
      completions: completed.length,
      abandoned: abandoned.length,
      inProgress: active.filter((attempt) => attempt.status === "in_progress").length,
      completionRate: rate(completed.length, active.length),
    },
    completionBehavior: {
      averageDurationMs: average(durations),
      medianDurationMs: median(durations),
      abandonmentByQuestion: ranked(abandonedProgress.map((event) => event?.metadata?.questionKey)),
      abandonmentBySection: ranked(abandonedProgress.map((event) => event?.metadata?.sectionKey)),
      abandonedBeforeTrackedQuestion: abandonedProgress.filter((event) => !event?.metadata?.questionKey).length,
    },
    devices,
    continuity: {
      resumedAttempts: resumed.size,
      completedResumed: [...resumed].filter((id) => completedIds.has(id)).length,
      completedResumeRate: rate([...resumed].filter((id) => completedIds.has(id)).length, completed.length),
      secureReturnAttempts: returned.size,
      secureReturnRate: rate([...returned].filter((id) => completedIds.has(id)).length, completed.length),
      averageSessionsPerCompleted: average(completedSessionCounts),
      sessionTrackedCompletions: completedSessionCounts.length,
    },
    conversion: {
      ctaClickAttempts: ctaClicks.size,
      ctaClickThroughRate: rate([...ctaClicks].filter((id) => completedIds.has(id)).length, completed.length),
      interestSubmissions: interestSubmissions.size,
      interestSubmissionRate: rate([...interestSubmissions].filter((id) => completedIds.has(id)).length, completed.length),
    },
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((row) => ({ ...row, completionRate: rate(row.completions, row.starts) })),
  };
}
