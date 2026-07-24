import { supabase } from "../supabaseClient";

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function normalizeArchiveRecord(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceAssetId: row.source_asset_id,
    unit: row.unit || "",
    vin: row.vin || "",
    asset:
      row.asset_description ||
      row.asset_snapshot?.asset ||
      "",
    department:
      row.department ||
      row.asset_snapshot?.department ||
      "",
    archiveReason: row.archive_reason || "",
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    restoredAt: row.restored_at || null,
    restoredBy: row.restored_by || null,
    lifecycleStatus: row.restored_at ? "Restored" : "Archived",
    snapshot: row.asset_snapshot || {},
  };
}

function normalizeServiceError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage);
  }

  const message = String(error.message || "").trim();
  const normalizedMessage = message.toLowerCase();

  if (
    error.code === "23505" ||
    normalizedMessage.includes("already uses")
  ) {
    return new Error(
      message ||
        "The asset cannot be restored because its unit number or VIN is already active."
    );
  }

  if (error.code === "42501") {
    return new Error(
      message ||
        "You do not have permission to perform this archive operation."
    );
  }

  if (error.code === "P0002") {
    return new Error(
      message ||
        "The requested asset record could not be found."
    );
  }

  return new Error(message || fallbackMessage);
}

export async function listArchivedAssets(organizationId) {
  requireValue(
    organizationId,
    "An organization is required to load archived assets."
  );

  const { data, error } = await supabase
    .from("archived_assets")
    .select(
      `
        id,
        organization_id,
        source_asset_id,
        unit,
        vin,
        asset_description,
        department,
        archive_reason,
        archived_at,
        archived_by,
        restored_at,
        restored_by,
        asset_snapshot
      `
    )
    .eq("organization_id", organizationId)
    .order("archived_at", { ascending: false });

  if (error) {
    throw normalizeServiceError(
      error,
      "ARGOS could not load archived assets."
    );
  }

  return (data || []).map(normalizeArchiveRecord);
}

export async function archiveAsset({
  assetId,
  archiveReason = "",
}) {
  requireValue(
    assetId,
    "An active asset ID is required to archive an asset."
  );

  const { data, error } = await supabase.rpc(
    "argos_archive_asset",
    {
      p_asset_id: assetId,
      p_archive_reason:
        String(archiveReason || "").trim() || null,
    }
  );

  if (error) {
    throw normalizeServiceError(
      error,
      "ARGOS could not archive this asset."
    );
  }

  return normalizeArchiveRecord(data);
}

export async function restoreArchivedAsset(
  archivedAssetId
) {
  requireValue(
    archivedAssetId,
    "An archived asset ID is required to restore an asset."
  );

  const { data, error } = await supabase.rpc(
    "argos_restore_archived_asset",
    {
      p_archived_asset_id: archivedAssetId,
    }
  );

  if (error) {
    throw normalizeServiceError(
      error,
      "ARGOS could not restore this asset."
    );
  }

  return data;
}