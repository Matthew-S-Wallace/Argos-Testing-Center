import { supabase } from "../supabaseClient";
import { mapSupabaseAsset } from "./ARGOS_Supabase_Mapping_Service";
import {
  archiveAsset,
  listArchivedAssets,
  restoreArchivedAsset,
} from "./ARGOS_Asset_Archive_Service";

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("An organization is required for asset lifecycle operations.");
  }
}

function normalizeLifecycleError(error, fallbackMessage) {
  if (error instanceof Error) return error;
  return new Error(String(error?.message || fallbackMessage));
}

export async function loadActiveAssets(organizationId) {
  requireOrganizationId(organizationId);

  const { data, error } = await supabase
    .from("assets")
    .select("*, asset_types(asset_type_name), technicians(technician_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw normalizeLifecycleError(
      error,
      "ARGOS could not load active assets."
    );
  }

  return (data || []).map((row) => ({
    ...mapSupabaseAsset(row),
    id: row.id,
    organizationId: row.organization_id,
  }));
}

export async function loadAssetLifecycleHistory(organizationId) {
  requireOrganizationId(organizationId);
  return listArchivedAssets(organizationId);
}

export async function loadCurrentlyArchivedAssets(organizationId) {
  const lifecycleRecords = await loadAssetLifecycleHistory(organizationId);
  return lifecycleRecords.filter((record) => !record.restoredAt);
}

export async function archiveOperationalAsset({ assetId, archiveReason = "" }) {
  if (!assetId) {
    throw new Error("An active asset ID is required to archive an asset.");
  }

  return archiveAsset({ assetId, archiveReason });
}

export async function restoreOperationalAsset(archivedAssetId) {
  if (!archivedAssetId) {
    throw new Error("An archived asset ID is required to restore an asset.");
  }

  const restoredAsset = await restoreArchivedAsset(archivedAssetId);
  return {
    ...mapSupabaseAsset(restoredAsset),
    id: restoredAsset.id,
    organizationId: restoredAsset.organization_id,
  };
}

export function getAssetLifecycleStatus(record) {
  return record?.restoredAt ? "Restored" : "Archived";
}

export function summarizeAssetLifecycle(records = []) {
  return records.reduce(
    (summary, record) => {
      summary.totalEvents += 1;
      if (record?.restoredAt) summary.restoredEvents += 1;
      else summary.currentlyArchived += 1;
      return summary;
    },
    {
      totalEvents: 0,
      currentlyArchived: 0,
      restoredEvents: 0,
    }
  );
}