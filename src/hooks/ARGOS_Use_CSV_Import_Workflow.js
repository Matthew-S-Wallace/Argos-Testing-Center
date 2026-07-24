import { useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  downloadAssetCSVTemplate,
  downloadRejectedCSVRows,
  readCSVFile,
  validateImportedAssetRows,
} from "../services/ARGOS_CSV_Data_Management_Service";
import { normalizeImportedAsset } from "../services/ARGOS_Asset_Normalization_Service";
import { mapSupabaseAsset } from "../services/ARGOS_Supabase_Mapping_Service";

const EMPTY_PROGRESS = { phase: "idle", message: "" };

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
  const [importStatusTone, setImportStatusTone] = useState("neutral");
  const [sourceRowCount, setSourceRowCount] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);

  const validationSummary = useMemo(() => ({
    total: sourceRowCount,
    valid: previewAssets.length,
    rejected: rejectedRows.length,
    duplicates: rejectedRows.filter((row) => row.category === "duplicate").length,
  }), [previewAssets.length, rejectedRows, sourceRowCount]);

  function setStatus(message, tone = "neutral") {
    setImportStatus(message);
    setImportStatusTone(tone);
  }

  function resetPreview({ preserveStatus = false } = {}) {
    setSelectedFileName("");
    setPreviewAssets([]);
    setRejectedRows([]);
    setSourceRowCount(0);
    setProgress(EMPTY_PROGRESS);

    if (!preserveStatus) {
      setStatus("", "neutral");
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

    if (!file) return;

    setIsReading(true);
    setStatus("", "neutral");
    setSelectedFileName(file.name);
    setPreviewAssets([]);
    setRejectedRows([]);
    setSourceRowCount(0);
    setProgress({ phase: "reading", message: "Reading and validating CSV file…" });

    try {
      const { rows } = await readCSVFile(file);
      setSourceRowCount(rows.length);
      setProgress({ phase: "validating", message: `Validating ${rows.length} asset row${rows.length === 1 ? "" : "s"}…` });

      const validation = validateImportedAssetRows({
        rows,
        existingAssets: assets,
        normalizeRow: (row) => normalizeImportedAsset(row, statusOptions),
        resolveDepartment,
      });

      setPreviewAssets(validation.validImportedAssets);
      setRejectedRows(validation.rejectedRows);

      if (!rows.length) {
        setStatus("No asset rows were found below the CSV header.", "warning");
      } else if (!validation.validImportedAssets.length) {
        setStatus("No rows are eligible for import. Review the rejected-row details and correct the CSV file.", "error");
      } else if (validation.rejectedRows.length) {
        setStatus(
          `${validation.validImportedAssets.length} row${validation.validImportedAssets.length === 1 ? " is" : "s are"} ready to import. ${validation.rejectedRows.length} row${validation.rejectedRows.length === 1 ? " requires" : "s require"} correction.`,
          "warning"
        );
      } else {
        setStatus(`All ${validation.validImportedAssets.length} asset row${validation.validImportedAssets.length === 1 ? " is" : "s are"} valid and ready to import.`, "success");
      }
    } catch (error) {
      console.error("ARGOS CSV file read failed:", error);
      setPreviewAssets([]);
      setRejectedRows([]);
      setSourceRowCount(0);
      setStatus(error?.message || "ARGOS could not read that CSV file. Please verify the file and try again.", "error");
    } finally {
      setIsReading(false);
      setProgress(EMPTY_PROGRESS);
      if (event.target) event.target.value = "";
    }
  }

  async function confirmImport() {
    if (!previewAssets.length || isImporting) return;

    setIsImporting(true);
    setStatus("", "neutral");
    setProgress({ phase: "importing", message: `Importing ${previewAssets.length} validated asset${previewAssets.length === 1 ? "" : "s"}…` });

    try {
      if (isDemoMode) {
        setAssets((currentAssets) => [...currentAssets, ...previewAssets]);
        setStatus(
          `Import complete: ${previewAssets.length} temporary demo asset${previewAssets.length === 1 ? "" : "s"} added${rejectedRows.length ? `; ${rejectedRows.length} rejected row${rejectedRows.length === 1 ? " was" : "s were"} not imported` : ""}. Demo changes disappear when the demo is refreshed or exited.`,
          "success"
        );
        onImportComplete?.();
        resetPreview({ preserveStatus: true });
        return;
      }

      if (!organizationId) {
        setStatus("ARGOS could not identify the organization for this import. No assets were saved.", "error");
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

      const { data, error } = await supabase.from("assets").insert(cloudRows).select();
      if (error) throw error;

      const savedAssets = (data || []).map(mapSupabaseAsset);
      setAssets((currentAssets) => [...currentAssets, ...savedAssets]);
      setStatus(
        `Import complete: ${savedAssets.length} asset${savedAssets.length === 1 ? "" : "s"} added successfully${rejectedRows.length ? `; ${rejectedRows.length} rejected row${rejectedRows.length === 1 ? " was" : "s were"} not imported` : ""}.`,
        "success"
      );
      onImportComplete?.();
      resetPreview({ preserveStatus: true });
    } catch (error) {
      console.error("ARGOS cloud CSV import failed:", error);
      setStatus("ARGOS could not save the validated assets. No completion was recorded; review the connection and try again.", "error");
    } finally {
      setIsImporting(false);
      setProgress(EMPTY_PROGRESS);
    }
  }

  function downloadRejectedRows() {
    downloadRejectedCSVRows({ fileName: selectedFileName, rejectedRows });
  }

  return {
    csvInputRef,
    selectedFileName,
    previewAssets,
    rejectedRows,
    validationSummary,
    importStatus,
    importStatusTone,
    progress,
    isReading,
    isImporting,
    downloadTemplate: downloadAssetCSVTemplate,
    downloadRejectedRows,
    selectCSVFile,
    prepareCSVPreview,
    confirmImport,
    resetPreview,
  };
}