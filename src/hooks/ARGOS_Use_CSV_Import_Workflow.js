import { useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  downloadAssetCSVTemplate,
  readCSVFile,
  validateImportedAssetRows,
} from "../services/ARGOS_CSV_Data_Management_Service";
import { normalizeImportedAsset } from "../services/ARGOS_Asset_Normalization_Service";
import { mapSupabaseAsset } from "../services/ARGOS_Supabase_Mapping_Service";

export default function useARGOSCSVImportWorkflow({
  assets,
  setAssets,
  organizationId,
  isDemoMode,
  statusOptions,
  resolveDepartment,
  onImportComplete,
}) {
  const csvInputRef = useRef(null);

  const [selectedFileName, setSelectedFileName] = useState("");
  const [previewAssets, setPreviewAssets] = useState([]);
  const [rejectedRows, setRejectedRows] = useState([]);
  const [importStatus, setImportStatus] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function resetPreview({ preserveStatus = false } = {}) {
    setSelectedFileName("");
    setPreviewAssets([]);
    setRejectedRows([]);

    if (!preserveStatus) {
      setImportStatus("");
    }

    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  }

  function selectCSVFile() {
    csvInputRef.current?.click();
  }

  async function prepareCSVPreview(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsReading(true);
    setImportStatus("");
    setSelectedFileName(file.name);

    try {
      const rows = await readCSVFile(file);

      const validation = validateImportedAssetRows({
        rows,
        existingAssets: assets,
        normalizeRow: (row) =>
          normalizeImportedAsset(row, statusOptions),
        resolveDepartment,
      });

      setPreviewAssets(validation.validImportedAssets);
      setRejectedRows(validation.rejectedRows);

      if (!rows.length) {
        setImportStatus(
          "No asset rows were found in that CSV file."
        );
      }
    } catch (error) {
      console.error("ARGOS CSV file read failed:", error);

      setPreviewAssets([]);
      setRejectedRows([]);
      setImportStatus(
        "ARGOS could not read that CSV file. Please try again."
      );
    } finally {
      setIsReading(false);

      if (event.target) {
        event.target.value = "";
      }
    }
  }

  async function confirmImport() {
    if (!previewAssets.length || isImporting) {
      return;
    }

    setIsImporting(true);
    setImportStatus("");

    try {
      if (isDemoMode) {
        setAssets((currentAssets) => [
          ...currentAssets,
          ...previewAssets,
        ]);

        setImportStatus(
          `Imported ${previewAssets.length} temporary demo asset${
            previewAssets.length === 1 ? "" : "s"
          }. These changes will disappear when the demo is exited or refreshed.${
            rejectedRows.length
              ? ` Rejected ${rejectedRows.length} row${
                  rejectedRows.length === 1 ? "" : "s"
                }.`
              : ""
          }`
        );

        onImportComplete?.();
        resetPreview({ preserveStatus: true });
        return;
      }

      if (!organizationId) {
        setImportStatus(
          "ARGOS could not identify the organization for this import."
        );
        return;
      }

      const cloudRows = previewAssets.map((asset) => ({
        organization_id: organizationId,
        unit: asset.unit,
        vin: asset.vin,
        department: asset.department,
        department_id: asset.departmentId || null,
        asset: asset.asset,
        status: asset.status,
        status_started_at: asset.statusStartedAt || null,
        reason: asset.reason,
        priority: asset.priority,
        down_since: asset.downSince || null,
        technician: asset.technician,
        rts_type: asset.rtsType,
        rts_date: asset.rtsDate || null,
        details: asset.details,
      }));

      const { data, error } = await supabase
        .from("assets")
        .insert(cloudRows)
        .select();

      if (error) {
        throw error;
      }

      const savedAssets = (data || []).map(mapSupabaseAsset);

      setAssets((currentAssets) => [
        ...currentAssets,
        ...savedAssets,
      ]);

      setImportStatus(
        `Imported ${savedAssets.length} asset${
          savedAssets.length === 1 ? "" : "s"
        } successfully.${
          rejectedRows.length
            ? ` Rejected ${rejectedRows.length} row${
                rejectedRows.length === 1 ? "" : "s"
              }.`
            : ""
        }`
      );

      onImportComplete?.();
      resetPreview({ preserveStatus: true });
    } catch (error) {
      console.error("ARGOS cloud CSV import failed:", error);

      setImportStatus(
        "ARGOS could not save the valid CSV assets to the cloud."
      );
    } finally {
      setIsImporting(false);
    }
  }

  return {
    csvInputRef,
    selectedFileName,
    previewAssets,
    rejectedRows,
    importStatus,
    setImportStatus,
    isReading,
    isImporting,
    downloadTemplate: downloadAssetCSVTemplate,
    selectCSVFile,
    prepareCSVPreview,
    confirmImport,
    resetPreview,
  };
}