import {
  calculateStatusDurationDays,
  getTodayDateString,
} from "./ARGOS_Date_Time_Service";

const STATUS_HISTORY_STORAGE_KEY = "argosStatusHistoryEvents";

function getStatusHistoryStorageKey(organizationId) {
  return organizationId
    ? `${STATUS_HISTORY_STORAGE_KEY}:${organizationId}`
    : null;
}

export function loadStatusHistoryEvents(organizationId) {
  const storageKey = getStatusHistoryStorageKey(organizationId);
  if (!storageKey) return [];

  const savedEvents = localStorage.getItem(storageKey);
  if (!savedEvents) return [];

  try {
    const parsedEvents = JSON.parse(savedEvents);
    return Array.isArray(parsedEvents) ? parsedEvents : [];
  } catch {
    return [];
  }
}

export function saveStatusHistoryEvents(
  organizationId,
  statusHistoryEvents
) {
  const storageKey = getStatusHistoryStorageKey(organizationId);
  if (!storageKey) return false;

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        Array.isArray(statusHistoryEvents)
          ? statusHistoryEvents
          : []
      )
    );

    return true;
  } catch {
    return false;
  }
}

export function createStatusHistoryEvent(
  previousAsset,
  updatedAsset,
  statusHistoryEvents = []
) {
  const recordedAt = new Date().toISOString();

  const latestTransitionIntoCurrentStatus = statusHistoryEvents
    .filter(
      (event) =>
        event.unit === previousAsset.unit &&
        event.newStatus === previousAsset.status &&
        event.recordedAt
    )
    .sort((firstEvent, secondEvent) =>
      String(secondEvent.recordedAt).localeCompare(
        String(firstEvent.recordedAt)
      )
    )[0];

  const statusStartedAt =
    latestTransitionIntoCurrentStatus?.recordedAt ||
    previousAsset.statusStartedAt ||
    previousAsset.downSince ||
    getTodayDateString();

  const statusEndedAt = recordedAt;

  return {
    id: `${previousAsset.unit}-${previousAsset.status}-${updatedAsset.status}-${Date.now()}`,
    unit: previousAsset.unit,
    vin: updatedAsset.vin || previousAsset.vin || "",

    department:
      updatedAsset.department || previousAsset.department,

    asset:
      updatedAsset.asset || previousAsset.asset,

    previousStatus:
      previousAsset.status,

    newStatus:
      updatedAsset.status,

    reason:
      updatedAsset.reason ||
      previousAsset.reason ||
      "Other",

    details:
      updatedAsset.details ||
      previousAsset.details ||
      "Details pending",

    technician:
      updatedAsset.technician ||
      previousAsset.technician ||
      "Unassigned",

    statusStartedAt,
    statusEndedAt,

    durationDays: calculateStatusDurationDays(
      statusStartedAt,
      statusEndedAt
    ),

    recordedAt,
  };
}