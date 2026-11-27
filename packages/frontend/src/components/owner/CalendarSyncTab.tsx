import { useSimpleFeedbackState } from "@/components/ui/FeedbackProvider";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  Calendar,
  RefreshCw,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { getStaffSessionToken } from "@/hooks/useAuth";
import { CalendarReconciliationReview } from "./CalendarReconciliationReview";

// ── Types ───────────────────────────────────────────────────────────────

interface CalendarSyncTabProps {
  propertyId: Id<"properties">;
  companyId: Id<"companies">;
  userId: Id<"users">;
  propertyName: string;
  canReconcile?: boolean;
}

const PLATFORM_OPTIONS = [
  { value: "airbnb", label: "Airbnb" },
  { value: "vrbo", label: "Vrbo" },
  { value: "other", label: "Other" },
] as const;
type Platform = (typeof PLATFORM_OPTIONS)[number]["value"];

const JOB_TYPE_OPTIONS = [
  { value: "turnover", label: "Turnover" },
  { value: "standard", label: "Standard" },
  { value: "deep_clean", label: "Deep Clean" },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ── Main Component ──────────────────────────────────────────────────────

export function CalendarSyncTab({
  propertyId,
  companyId,
  userId,
  propertyName,
  canReconcile = false,
}: CalendarSyncTabProps) {
  const sessionToken = getStaffSessionToken();
  const connections = useQuery(
    api.queries.calendarConnections.listByProperty,
    sessionToken ? { userId, sessionToken, companyId, propertyId } : "skip"
  );
  const reservations = useQuery(
    api.queries.calendarReservations.listByProperty,
    sessionToken ? { userId, sessionToken, companyId, propertyId } : "skip"
  );
  const rule = useQuery(
    api.queries.jobAutomationRules.getByProperty,
    sessionToken ? { userId, sessionToken, companyId, propertyId } : "skip"
  );

  // Pick the primary connection (first one, or none)
  const connection = connections?.[0] ?? null;
  const hasConnection = connection !== null;
  const hasMultipleConnections = (connections?.length ?? 0) > 1;

  if (connections === undefined) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Multiple connections warning */}
      {hasMultipleConnections && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Multiple calendar feeds detected ({connections!.length})</p>
              <p className="mt-1 text-amber-700">
                This property has {connections!.length} calendar feeds connected. This UI manages only the primary feed shown below.
                The other {connections!.length - 1} feed{connections!.length > 2 ? "s" : ""} will continue syncing in the background.
                Contact support if you need to remove extra feeds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feed Connection Section */}
      <ConnectionSection
        connection={connection}
        propertyId={propertyId}
        companyId={companyId}
        userId={userId}
        sessionToken={sessionToken}
      />

      {/* Automation Rules Section */}
      {hasConnection && (
        <AutomationRulesSection
          rule={rule}
          propertyId={propertyId}
          companyId={companyId}
          userId={userId}
          sessionToken={sessionToken}
        />
      )}

      {/* Reservations Section */}
      {reservations && reservations.length > 0 && (
        <ReservationsSection reservations={reservations} connections={connections ?? []}
          propertyName={propertyName} userId={userId} sessionToken={sessionToken} canReconcile={canReconcile} />
      )}

      {/* Explainer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">How calendar sync works</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>SCRUB checks your calendar feed every hour for events</li>
          <li>Imported events require owner classification; titles and provider labels do not confirm a guest stay</li>
          <li>Confirmed guest events can create one unassigned job per checkout date when automation rules allow it</li>
          <li>You still assign cleaners manually after jobs are created</li>
          <li>Missing reservations stay active and appear below for owner review; absence does not confirm cancellation</li>
          <li>Reservation changes and explicit cancellations do not modify existing cleaning jobs</li>
        </ul>
      </div>
    </div>
  );
}

// ── Connection Section ──────────────────────────────────────────────────

function ConnectionSection({
  connection,
  propertyId,
  companyId,
  userId,
  sessionToken,
}: {
  connection: any;
  propertyId: Id<"properties">;
  companyId: Id<"companies">;
  userId: Id<"users">;
  sessionToken: string;
}) {
  const [showForm, setShowForm] = useState(!connection);
  const [url, setUrl] = useState(connection?.icalUrl ?? "");
  const [platform, setPlatform] = useState<Platform>(connection?.platform ?? "airbnb");
  const [label, setLabel] = useState(connection?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useSimpleFeedbackState();

  const createConnection = useMutation(api.mutations.calendarConnections.create);
  const updateConnection = useMutation(api.mutations.calendarConnections.update);
  const setEnabled = useMutation(api.mutations.calendarConnections.setEnabled);
  const removeConnection = useMutation(api.mutations.calendarConnections.remove);
  const triggerSync = useMutation(api.mutations.calendarSync.triggerSync);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const handleSave = async () => {
    if (!url.trim()) {
      setError("Please enter a calendar feed URL");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (connection) {
        await updateConnection({
          userId,
          sessionToken,
          connectionId: connection._id,
          icalUrl: url.trim(),
          platform,
          label: label.trim() || undefined,
        });
        showToast("Calendar feed updated");
      } else {
        await createConnection({
          userId,
          sessionToken,
          companyId,
          propertyId,
          icalUrl: url.trim(),
          platform,
          label: label.trim() || undefined,
        });
        showToast("Calendar feed connected");
      }
      setShowForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!connection) return;
    try {
      await setEnabled({
        userId,
        sessionToken,
        connectionId: connection._id,
        enabled: !connection.enabled,
      });
      showToast(connection.enabled ? "Sync disabled" : "Sync enabled");
    } catch (err: any) {
      setError(err.message || "Failed to toggle");
    }
  };

  const handleRemove = async () => {
    if (!connection) return;
    try {
      await removeConnection({ userId, sessionToken, connectionId: connection._id });
      setUrl("");
      setLabel("");
      setPlatform("airbnb");
      setShowForm(true);
      showToast("Calendar feed removed");
    } catch (err: any) {
      setError(err.message || "Failed to remove");
    }
  };

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    setError("");
    try {
      const outcome = await triggerSync({ userId, sessionToken, connectionId: connection._id });
      showToast(outcome === "busy" ? "Sync is already pending or running"
        : outcome === "cooldown" ? "Please wait a minute before syncing again"
        : outcome === "suspended" ? "Sync disabled after repeated failures. Check the feed and re-enable."
        : "Sync started — results will appear shortly");
    } catch (err: any) {
      setError(err.message || "Failed to trigger sync");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="card">

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900">Calendar Feed</h3>
        </div>
        {connection && !showForm && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || !connection.enabled}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={() => {
                setUrl(connection.icalUrl);
                setPlatform(connection.platform);
                setLabel(connection.label ?? "");
                setShowForm(true);
              }}
              className="btn-secondary text-sm"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Status display when not editing */}
      {connection && !showForm && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <SyncStatusIcon status={connection.lastSyncStatus} enabled={connection.enabled} />
              <span className="text-gray-700">
                {!connection.enabled ? (
                  <span className="text-gray-400">Disabled</span>
                ) : connection.lastSyncStatus === "pending" ? (
                  "Sync pending"
                ) : connection.lastSyncStatus === "empty" ? (
                  <>Feed checked {timeAgo(connection.lastCheckedAt)} — no events returned</>
                ) : connection.lastSyncStatus === "success" ? (
                  <>Last synced {timeAgo(connection.lastSyncAt)}</>
                ) : (
                  <span className="text-red-600">
                    Sync error{connection.consecutiveErrors > 1 ? ` (${connection.consecutiveErrors} consecutive)` : ""}
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                connection.enabled ? "bg-primary-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  connection.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {connection.lastSyncStatus === "empty" && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              Reservations and jobs were kept unchanged.
              {connection.enabled ? <> Automatic checks will continue.</> : <> Sync is disabled.</>}
              {connection.lastSyncAt
                ? <> Last authoritative reconciliation: {timeAgo(connection.lastSyncAt)}.</>
                : <> No authoritative reconciliation has completed yet.</>}
            </div>
          )}

          {connection.lastSyncError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              {connection.lastSyncError}
            </div>
          )}

          {!connection.enabled && connection.consecutiveErrors >= 3 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Auto-disabled after repeated sync failures. Fix the feed URL and re-enable.
            </div>
          )}

          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span className="capitalize font-medium">{connection.platform}</span>
              {connection.label && <span className="text-gray-400">· {connection.label}</span>}
            </div>
            <div className="text-xs text-gray-400 truncate">{connection.icalUrl}</div>
          </div>

          <button
            onClick={handleRemove}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 mt-1"
          >
            <Unlink className="w-3 h-3" /> Remove feed
          </button>
        </div>
      )}

      {/* Form for adding/editing */}
      {showForm && (
        <div className="space-y-4">
          {!connection && (
            <p className="text-sm text-gray-500">
              Connect an iCal feed to import events for review. A cleaning job requires owner-confirmed guest classification and enabled automation.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
            <select
              className="input-field"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">iCal Feed URL</label>
            <input
              type="url"
              className="input-field"
              placeholder="https://www.airbnb.com/calendar/ical/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Main Airbnb listing"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? "Saving…" : connection ? "Update Feed" : "Connect Feed"}
            </button>
            {connection && (
              <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SyncStatusIcon({ status, enabled }: { status: string; enabled: boolean }) {
  if (!enabled) return <XCircle className="w-4 h-4 text-gray-300" />;
  if (status === "empty") return <Clock className="w-4 h-4 text-blue-600" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

// ── Automation Rules Section ────────────────────────────────────────────

function AutomationRulesSection({
  rule,
  propertyId,
  companyId,
  userId,
  sessionToken,
}: {
  rule: any;
  propertyId: Id<"properties">;
  companyId: Id<"companies">;
  userId: Id<"users">;
  sessionToken: string;
}) {
  const [editing, setEditing] = useState(false);
  const [jobType, setJobType] = useState(rule?.jobType ?? "turnover");
  const [duration, setDuration] = useState(String(rule?.defaultDurationMinutes ?? 180));
  const [startTime, setStartTime] = useState(rule?.defaultStartTime ?? "16:00");
  const [useDefaultTime, setUseDefaultTime] = useState(
    rule?.defaultStartTime === undefined || rule?.defaultStartTime === "16:00"
  );
  const [blankTime, setBlankTime] = useState(rule?.defaultStartTime === "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const upsertRule = useMutation(api.mutations.jobAutomationRules.upsert);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      let resolvedStartTime: string | undefined;
      if (blankTime) {
        resolvedStartTime = "";
      } else if (useDefaultTime) {
        resolvedStartTime = "16:00";
      } else {
        resolvedStartTime = startTime;
      }

      await upsertRule({
        userId,
        sessionToken,
        companyId,
        propertyId,
        enabled: true,
        jobType,
        defaultDurationMinutes: parseInt(duration) || 180,
        defaultStartTime: resolvedStartTime,
      });
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Derive display values
  const displayType = JOB_TYPE_OPTIONS.find((o) => o.value === (rule?.jobType ?? "turnover"))?.label ?? "Turnover";
  const displayDuration = rule?.defaultDurationMinutes ?? 180;
  const displayTime =
    rule?.defaultStartTime === "" ? "Not set" :
    rule?.defaultStartTime ?? "4:00 PM (default)";

  const isEnabled = rule?.enabled !== false;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Job Automation</h3>
        {!editing && (
          <button
            onClick={() => {
              setJobType(rule?.jobType ?? "turnover");
              setDuration(String(rule?.defaultDurationMinutes ?? 180));
              const st = rule?.defaultStartTime;
              setStartTime(st === "" || st === undefined ? "16:00" : st);
              setUseDefaultTime(st === undefined || st === "16:00");
              setBlankTime(st === "");
              setEditing(true);
            }}
            className="btn-secondary text-sm"
          >
            {rule ? "Edit" : "Configure"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {!editing && (
        <div className="space-y-2 text-sm">
          {!rule ? (
            <p className="text-gray-500">
              No automation configured. Confirmed guest events will not create jobs until rules are enabled.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className={isEnabled ? "text-green-600 font-medium" : "text-gray-400"}>
                  {isEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Job type</span>
                <span className="text-gray-900">{displayType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-gray-900">{displayDuration} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Default start time</span>
                <span className="text-gray-900">{displayTime}</span>
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
            <select className="input-field" value={jobType} onChange={(e) => setJobType(e.target.value)}>
              {JOB_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              className="input-field"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={30}
              max={720}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Start Time</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="timeMode"
                  checked={useDefaultTime && !blankTime}
                  onChange={() => { setUseDefaultTime(true); setBlankTime(false); }}
                />
                4:00 PM (default)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="timeMode"
                  checked={!useDefaultTime && !blankTime}
                  onChange={() => { setUseDefaultTime(false); setBlankTime(false); }}
                />
                <span>Custom:</span>
                <input
                  type="time"
                  className="input-field py-1 px-2 w-32"
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setUseDefaultTime(false); setBlankTime(false); }}
                  disabled={useDefaultTime || blankTime}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="timeMode"
                  checked={blankTime}
                  onChange={() => { setBlankTime(true); setUseDefaultTime(false); }}
                />
                No default (I'll set it manually per job)
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : "Save Rules"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reservations Section ────────────────────────────────────────────────

function ReservationsSection({ reservations, connections, propertyName, userId, sessionToken, canReconcile }: {
  reservations: any[]; connections: any[]; propertyName: string; userId: Id<"users">; sessionToken: string; canReconcile: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Keep unresolved missing episodes visible ahead of recent ordinary imports.
  const priority = (res: any) => {
    if (res.identityReview?.state === "pending" || res.dateReview?.state === "pending") return 5;
    if (res.missing && res.missing.acknowledgedAt === undefined) return 4;
    if ((res.status === "active" && res.classification?.kind === "needs_review") || res.dateConflict ||
        res.cancellationFlagged || (res.classification?.kind === "non_guest_block" && res.linkedJobId)) return 3;
    return res.missing ? 2 : 0;
  };
  const ordered = [...reservations].sort((a, b) => priority(b) - priority(a));
  const attention = ordered.filter(res => priority(res) > 0);
  const ordinary = ordered.filter(res => priority(res) === 0);
  const visible = expanded ? ordered : [...attention, ...ordinary.slice(0, 5)];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Synced Calendar Events</h3>
        <span className="text-xs text-gray-400">{reservations.length} total</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">Property: {propertyName}. Missing acknowledgement is not classification confirmation. All unresolved review items are shown; classification never changes an existing job.</p>

      <div className="divide-y divide-gray-100">
        {visible.map((res) => (
          <ReservationRow key={res._id} reservation={res}
            connection={connections.find((item) => item._id === res.connectionId)} userId={userId} sessionToken={sessionToken} neighbors={reservations} canReconcile={canReconcile} />
        ))}
      </div>

      {(ordinary.length > 5 || expanded) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>Show all {reservations.length} <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
}

function ReservationRow({ reservation, connection, userId, sessionToken, neighbors, canReconcile }: {
  reservation: any; connection: any; userId: Id<"users">; sessionToken: string; neighbors: any[]; canReconcile: boolean;
}) {
  const acknowledge = useMutation(api.mutations.calendarSync.acknowledgeMissingReservation);
  const classify = useMutation(api.mutations.calendarSync.confirmEventClassification);
  const [classifying, setClassifying] = useState(false);
  const [classificationMessage, setClassificationMessage] = useState<{ eventVersion: string; kind: string; text: string } | null>(null);
  const [classificationError, setClassificationError] = useState("");
  const classification = reservation.classification;
  const canClassify = reservation.status === "active" && connection && reservation.eventVersion?.startsWith(`${connection.feedRevision ?? 0}:`);
  const handleClassify = async (kind: "guest_reservation" | "non_guest_block") => {
    setClassifying(true); setClassificationError(""); setClassificationMessage(null);
    try {
      const result = await classify({ sessionToken, userId, reservationId: reservation._id, kind,
        expectedEventVersion: reservation.eventVersion, expectedRevision: classification?.revision ?? 0,
        expectedFeedRevision: connection.feedRevision ?? 0, expectedMissingEpisode: reservation.missing?.episodeId });
      const text = result.manualJobReviewRequired ? "Non-guest decision saved. Existing job retained; review that job separately."
        : result.outcome === "created" ? "Guest confirmed. An unassigned cleaning job was created."
        : result.outcome === "already_linked" ? "Decision saved. The existing linked job was kept unchanged."
        : `Decision saved. No new job: ${(result.skipReason ?? "not eligible").replace(/_/g, " ")}.`;
      setClassificationMessage({ eventVersion: reservation.eventVersion, kind, text });
    } catch (error: any) {
      setClassificationError(error.message || "Could not save classification. Refresh and review again.");
    } finally { setClassifying(false); }
  };
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const missing = reservation.missing;
  const handleAcknowledge = async () => {
    setReviewing(true);
    setReviewError("");
    try {
      await acknowledge({ sessionToken, userId, reservationId: reservation._id, episodeId: missing.episodeId });
    } catch (error: any) {
      setReviewError(error.message || "Could not acknowledge this reservation");
    } finally {
      setReviewing(false);
    }
  };
  const isCancelled = reservation.status === "cancelled";
  const hasJob = !!reservation.linkedJobId;
  const hasConflict = reservation.dateConflict;
  const hasCancelFlag = reservation.cancellationFlagged;
  const wasSkipped = reservation.jobCreationSkipped;

  return (
    <div className={`py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${isCancelled ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-900 font-medium">
            {formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}
          </span>
          {isCancelled && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
              Cancelled
            </span>
          )}
          {missing && <span className="text-xs font-medium text-amber-800">Missing from feed — {missing.acknowledgedAt === undefined ? "review needed" : "acknowledged"}</span>}
          {hasConflict && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
              Dates changed
            </span>
          )}
          {hasCancelFlag && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
              Review needed
            </span>
          )}
        </div>
        <div className="mt-2 text-xs space-y-2 break-words [overflow-wrap:anywhere]">
          <p className="font-medium">{classification?.kind === "guest_reservation" ? "Guest reservation — owner confirmed"
            : classification?.kind === "non_guest_block" ? "Non-guest block — owner confirmed"
            : classification?.kind === "needs_review" ? "Needs classification — no automatic job"
            : "Legacy import — classification unconfirmed; existing jobs retained"}</p>
          {classification?.source === "owner" ? (
            <p>Owner {String(classification.ownerDecision?.actorId ?? "").slice(-6)} confirmed {new Date(classification.classifiedAt).toLocaleString()}.</p>
          ) : <p>Unverified iCal evidence. Event titles, dates and provider labels cannot establish a guest booking.</p>}
          {classification?.reason === "material_event_changed" && <p role="status">Event evidence changed. Renewed owner review is required; the prior decision has been retained.</p>}
          {classification?.ownerDecision && classification.kind === "needs_review" && <p>Previous owner decision: {classification.ownerDecision.kind === "guest_reservation" ? "guest reservation" : "non-guest block"}, {new Date(classification.ownerDecision.confirmedAt).toLocaleString()}.</p>}
          {reservation.eventMetadata && <p>Unverified fields: status {reservation.eventMetadata.status || "not supplied"}; transparency {reservation.eventMetadata.transparency || "not supplied"}; categories {reservation.eventMetadata.categories?.join(", ") || "not supplied"}.</p>}
          {classification?.kind === "non_guest_block" && hasJob && <p role="status" className="text-amber-800">A cleaning job already exists. It was not canceled or deleted. Review that job separately.</p>}
          {canClassify ? <>
            <p>Confirming a guest can create an unassigned job if automation and eligibility allow it. {hasJob ? "A job is already linked and will be kept unchanged." : "No cleaning job is linked."}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs min-h-11 focus-visible:ring-2 focus-visible:ring-primary-600" disabled={classifying || reservation.identityReview?.state === "pending" || reservation.identityReview?.state === "duplicate" || reservation.dateReview?.state === "pending"} onClick={() => handleClassify("guest_reservation")}>Confirm guest reservation</button>
              <button type="button" className="btn-secondary text-xs min-h-11 focus-visible:ring-2 focus-visible:ring-primary-600" disabled={classifying} onClick={() => handleClassify("non_guest_block")}>Confirm non-guest block</button>
            </div>
          </> : !isCancelled && <p>{connection ? "Sync this feed before confirming classification." : "Classification unavailable: this feed was removed."}</p>}
          {canClassify && classificationMessage?.eventVersion === reservation.eventVersion &&
            (!classification || classification.kind === "needs_review" || classification.kind === classificationMessage?.kind) &&
            <p role="status" aria-live="polite">{classificationMessage?.text}</p>}
          {classificationError && <p role="alert" className="text-red-700">{classificationError}</p>}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          <CalendarReconciliationReview reservation={reservation} neighbors={neighbors}
            feedRevision={connection ? connection.feedRevision ?? 0 : undefined} canReview={canReconcile} sessionToken={sessionToken} userId={userId} />
          Feed: {connection ? `${connection.label || connection.platform} (${connection.platform})` : "Removed feed"}
          {reservation.connectionId && <> · {String(reservation.connectionId).slice(-6)}</>}
        </div>
        {missing && (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
            <p>Not confirmed canceled. The reservation remains active; any linked job is unchanged.</p>
            <p>Last seen: {new Date(reservation.lastSeenAt).toLocaleString()}.</p>
            <p>First missing: {new Date(missing.firstMissingAt).toLocaleString()}. Last missing: {new Date(missing.lastMissingAt).toLocaleString()}.</p>
            <p>Absent from {missing.observations} valid nonempty sync{missing.observations === 1 ? "" : "s"}. {hasJob ? "Cleaning job linked." : "No cleaning job linked."}</p>
            {missing.acknowledgedAt !== undefined ? (
              <p>Acknowledged {new Date(missing.acknowledgedAt).toLocaleString()}. Still missing; future observations will continue to be counted.</p>
            ) : (
              <button onClick={handleAcknowledge} disabled={reviewing} className="btn-secondary text-xs">
                {reviewing ? "Acknowledging…" : "Acknowledge missing reservation"}
              </button>
            )}
            {reviewError && <p role="alert" className="text-red-700">{reviewError}</p>}
          </div>
        )}
        {isCancelled && reservation.cancellationEvidence && <p className="text-xs text-gray-500 mt-1">Provider explicitly canceled this reservation {new Date(reservation.cancellationEvidence.observedAt).toLocaleString()}. Linked jobs are unchanged.</p>}
        <div className="text-xs text-gray-400 mt-0.5 break-words [overflow-wrap:anywhere]">
          {reservation.summary && <span>{reservation.summary} · </span>}
          {wasSkipped && reservation.skipReason && (
            <span className="text-amber-600">
              Skipped: {reservation.skipReason.replace(/_/g, " ")}
            </span>
          )}
          {!wasSkipped && !hasJob && !isCancelled && (
            <span className="text-gray-400">{classification?.kind === "guest_reservation" ? "Job eligibility will be checked on sync" : "No job: classification not confirmed as guest"}</span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0">
        {hasJob ? (
          <Link
            href={`/jobs/${reservation.linkedJobId}`}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            View job <ExternalLink className="w-3 h-3" />
          </Link>
        ) : isCancelled ? (
          <span className="text-xs text-gray-300">—</span>
        ) : null}
      </div>
    </div>
  );
}
