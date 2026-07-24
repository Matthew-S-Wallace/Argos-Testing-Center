import {
  normalizeAsset,
  normalizeCompletedRepairEvent,
} from "./ARGOS_Asset_Normalization_Service";

const ASSET_STORAGE_KEY = "argosFleetAssets";
const COMPLETED_REPAIR_STORAGE_KEY =
  "argosCompletedRepairEvents";
const ACTIVE_VIEW_STORAGE_KEY = "argosActiveView";
const DEFAULT_ACTIVE_VIEW = "command";

function getOrganizationStorageKey(
  baseKey,
  organizationId
) {
  return organizationId
    ? `${baseKey}:${organizationId}`
    : null;
}

function readOrganizationStorage(
  baseKey,
  organizationId
) {
  const storageKey = getOrganizationStorageKey(
    baseKey,
    organizationId
  );

  if (!storageKey) return null;

  return localStorage.getItem(storageKey);
}

function writeOrganizationStorage(
  baseKey,
  organizationId,
  value
) {
  const storageKey = getOrganizationStorageKey(
    baseKey,
    organizationId
  );

  if (!storageKey) return false;

  localStorage.setItem(storageKey, value);
  return true;
}

export function loadSavedAssets(organizationId) {
  const savedAssets = readOrganizationStorage(
    ASSET_STORAGE_KEY,
    organizationId
  );

  if (!savedAssets) return [];

  try {
    const parsedAssets = JSON.parse(savedAssets);

    return Array.isArray(parsedAssets)
      ? parsedAssets.map(normalizeAsset)
      : [];
  } catch {
    return [];
  }
}

export function saveSavedAssets(
  organizationId,
  assets
) {
  return writeOrganizationStorage(
    ASSET_STORAGE_KEY,
    organizationId,
    JSON.stringify(
      Array.isArray(assets) ? assets : []
    )
  );
}

export function loadCompletedRepairEvents(
  organizationId
) {
  const savedEvents = readOrganizationStorage(
    COMPLETED_REPAIR_STORAGE_KEY,
    organizationId
  );

  if (!savedEvents) return [];

  try {
    const parsedEvents = JSON.parse(savedEvents);

    return Array.isArray(parsedEvents)
      ? parsedEvents.map(
          normalizeCompletedRepairEvent
        )
      : [];
  } catch {
    return [];
  }
}

export function saveCompletedRepairEvents(
  organizationId,
  completedRepairEvents
) {
  return writeOrganizationStorage(
    COMPLETED_REPAIR_STORAGE_KEY,
    organizationId,
    JSON.stringify(
      Array.isArray(completedRepairEvents)
        ? completedRepairEvents
        : []
    )
  );
}

export function loadActiveView(organizationId) {
  return (
    readOrganizationStorage(
      ACTIVE_VIEW_STORAGE_KEY,
      organizationId
    ) || DEFAULT_ACTIVE_VIEW
  );
}

export function saveActiveView(
  organizationId,
  activeView
) {
  return writeOrganizationStorage(
    ACTIVE_VIEW_STORAGE_KEY,
    organizationId,
    activeView || DEFAULT_ACTIVE_VIEW
  );
}