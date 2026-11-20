export const holidayCampaign = {
  code: "SCRUBHOLIDAY",
  percentOff: 50,
  months: 3,
} as const;

// All three transition dates fall in Eastern Standard Time (UTC−05:00).
const phases = [
  { name: "blackFriday", endsAt: Date.parse("2026-12-01T00:00:00-05:00"), accent: "bg-red-800" },
  { name: "holiday", endsAt: Date.parse("2027-01-01T00:00:00-05:00"), accent: "bg-emerald-800" },
  { name: "newYear", endsAt: Date.parse("2027-01-18T00:00:00-05:00"), accent: "bg-primary-800" },
] as const;

export function getHolidayPhase(now = Date.now()) {
  return phases.find(({ endsAt }) => now < endsAt);
}
