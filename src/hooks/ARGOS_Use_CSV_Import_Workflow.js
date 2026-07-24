import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function normalizeHistoryRecord(record) {
  return {
    id: record.id,
    organizationId: record.organization_id,
    importedBy: record.imported_by,
    importedByName: record.imported_by_name || "Unknown User",
    fileName: record.file_name || "Unnamed CSV",
    totalRows: Number(record.total_rows || 0),
    importedRows: Number(record.imported_rows || 0),
    rejectedRows: Number(record.rejected_rows || 0),
    duplicateRows: Number(record.duplicate_rows || 0),
    rejectedDetails: Array.isArray(record.rejected_details)
      ? record.rejected_details
      : [],
    importStatus: record.import_status || "completed",
    createdAt: record.created_at,
  };
}

export default function useARGOSCSVImportWorkflow({
  assets,
  setAssets,
  organizationId,
  importedByUserId,
  importedByName,
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
  const [importHistory, setImportHistory] = useState([]);
  const [importHistoryLoading, setImportHistoryLoading] = useState(false);
  const [importHistoryError, setImportHistoryError] = useState("");

  const validationSummary = useMemo(
    () => ({
      total: sourceRowCount,
      valid: previewAssets.length,
      rejected: rejectedRows.length,
      duplicates: rejectedRows.filter((row) => row.category === "duplicate").length,
    }),
    [previewAssets.length, rejectedRows, sourceRowCount]
  );

  function setStatus(message, tone = "neutral") {
    setImportStatus(message);
    setImportStatusTone(tone);
  }

  const loadImportHistory = useCallback(async () => {
    if (isDemoMode) {
      setImportHistoryLoading(false);
      setImportHistoryError("");
      return;
    }

    if (!organizationId) {
      setImportHistory([]);
      setImportHistoryLoading(false);
      setImportHistoryError("");
      return;
    }

    setImportHistoryLoading(true);
    setImportHistoryError("");

    const { data, error } = await supabase
      .from("csv_import_history")
      .select(
        "id, organization_id, imported_by, imported_by_name, file_name, total_rows, imported_rows, rejected_rows, duplicate_rows, rejected_details, import_status, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("ARGOS CSV import history load failed:", error);
      setImportHistory([]);
      setImportHistoryError(
        "ARGOS could not load CSV import history. Confirm the Sprint 001AF database migration has been applied."
      );
    } else {
      setImportHistory((data || []).map(normalizeHistoryRecord));
    }

    setImportHistoryLoading(false);
  }, [isDemoMode, organizationId]);

  useEffect(() => {
    void loadImportHistory();
  }, [loadImportHistory]);

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
      const parsedCSV = await readCSVFile(file);
const rows = Array.isArray(parsedCSV)
  ? parsedCSV
  : Array.isArray(parsedCSV?.rows)
    ? parsedCSV.rows
    : [];

setSourceRowCount(rows.length);
      setProgress({
        phase: "validating",
        message: `Validating ${rows.length} asset row${rows.length === 1 ? "" : "s"}…`,
      });

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
        setStatus(
          "No rows are eligible for import. Review the rejected-row details and correct the CSV file.",
          "error"
        );
      } else if (validation.rejectedRows.length) {
        setStatus(
          `${validation.validImportedAssets.length} row${
            validation.validImportedAssets.length === 1 ? " is" : "s are"
          } ready to import. ${validation.rejectedRows.length} row${
            validation.rejectedRows.length === 1 ? " requires" : "s require"
          } correction.`,
          "warning"
        );
      } else {
        setStatus(
          `All ${validation.validImportedAssets.length} asset row${
            validation.validImportedAssets.length === 1 ? " is" : "s are"
          } valid and ready to import.`,
          "success"
        );
      }
    } catch (error) {
      console.error("ARGOS CSV file read failed:", error);
      setPreviewAssets([]);
      setRejectedRows([]);
      setSourceRowCount(0);
      setStatus(
        error?.message ||
          "ARGOS could not read that CSV file. Please verify the file and try again.",
        "error"
      );
    } finally {
      setIsReading(false);
      setProgress(EMPTY_PROGRESS);
      if (event.target) event.target.value = "";
    }
  }

  async function recordImportHistory({
    fileName,
    totalRows,
    importedRows,
    rejectedRowRecords,
    duplicateRows,
  }) {
    const historyRecord = {
      id: `demo-import-${Date.now()}`,
      organizationId,
      importedBy: importedByUserId || null,
      importedByName: importedByName || "Unknown User",
      fileName: fileName || "Unnamed CSV",
      totalRows,
      importedRows,
      rejectedRows: rejectedRowRecords.length,
      duplicateRows,
      rejectedDetails: rejectedRowRecords,
      importStatus:
        rejectedRowRecords.length > 0 ? "completed_with_rejections" : "completed",
      createdAt: new Date().toISOString(),
    };

    if (isDemoMode) {
      setImportHistory((currentHistory) => [historyRecord, ...currentHistory]);
      return { historySaved: true };
    }

    const { data, error } = await supabase
      .from("csv_import_history")
      .insert({
        organization_id: organizationId,
        imported_by: importedByUserId || null,
        imported_by_name: importedByName || "Unknown User",
        file_name: historyRecord.fileName,
        total_rows: totalRows,
        imported_rows: importedRows,
        rejected_rows: rejectedRowRecords.length,
        duplicate_rows: duplicateRows,
        rejected_details: rejectedRowRecords,
        import_status: historyRecord.importStatus,
      })
      .select(
        "id, organization_id, imported_by, imported_by_name, file_name, total_rows, imported_rows, rejected_rows, duplicate_rows, rejected_details, import_status, created_at"
      )
      .single();

    if (error) {
      console.error("ARGOS CSV import history save failed:", error);
      return { historySaved: false };
    }

    setImportHistory((currentHistory) => [
      normalizeHistoryRecord(data),
      ...currentHistory.filter((record) => record.id !== data.id),
    ]);

    return { historySaved: true };
  }

  async function confirmImport() {
    if (!previewAssets.length || isImporting) return;

    const importSnapshot = {
      fileName: selectedFileName,
      totalRows: sourceRowCount,
      importedRows: previewAssets.length,
      rejectedRowRecords: [...rejectedRows],
      duplicateRows: validationSummary.duplicates,
    };

    setIsImporting(true);
    setStatus("", "neutral");
    setProgress({
      phase: "importing",
      message: `Importing ${previewAssets.length} validated asset${
        previewAssets.length === 1 ? "" : "s"
      }…`,
    });

    try {
      if (isDemoMode) {
        setAssets((currentAssets) => [...currentAssets, ...previewAssets]);
        await recordImportHistory(importSnapshot);
        setStatus(
          `Import complete: ${previewAssets.length} temporary demo asset${
            previewAssets.length === 1 ? "" : "s"
          } added${
            rejectedRows.length
              ? `; ${rejectedRows.length} rejected row${
                  rejectedRows.length === 1 ? " was" : "s were"
                } not imported`
              : ""
          }. Demo changes disappear when the demo is refreshed or exited.`,
          "success"
        );
        onImportComplete?.();
        resetPreview({ preserveStatus: true });
        return;
      }

      if (!organizationId) {
        setStatus(
          "ARGOS could not identify the organization for this import. No assets were saved.",
          "error"
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

      const { data, error } = await supabase.from("assets").insert(cloudRows).select();
      if (error) throw error;

      const savedAssets = (data || []).map(mapSupabaseAsset);
      setAssets((currentAssets) => [...currentAssets, ...savedAssets]);

      const historyResult = await recordImportHistory({
        ...importSnapshot,
        importedRows: savedAssets.length,
      });

      setStatus(
        `Import complete: ${savedAssets.length} asset${
          savedAssets.length === 1 ? "" : "s"
        } added successfully${
          rejectedRows.length
            ? `; ${rejectedRows.length} rejected row${
                rejectedRows.length === 1 ? " was" : "s were"
              } not imported`
            : ""
        }.${
          historyResult.historySaved
            ? ""
            : " The assets were saved, but ARGOS could not record the import-history entry."
        }`,
        historyResult.historySaved ? "success" : "warning"
      );

      onImportComplete?.();
      resetPreview({ preserveStatus: true });
    } catch (error) {
      console.error("ARGOS cloud CSV import failed:", error);
      setStatus(
        "ARGOS could not save the validated assets. No completion was recorded; review the connection and try again.",
        "error"
      );
    } finally {
      setIsImporting(false);
      setProgress(EMPTY_PROGRESS);
    }
  }

  function downloadRejectedRows() {
    downloadRejectedCSVRows({
      fileName: selectedFileName,
      rejectedRows,
    });
  }

  function downloadHistoryRejectedRows(historyRecord) {
    downloadRejectedCSVRows({
      fileName: historyRecord?.fileName || "argos-import-history",
      rejectedRows: historyRecord?.rejectedDetails || [],
    });
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
    importHistory,
    importHistoryLoading,
    importHistoryError,
    downloadTemplate: downloadAssetCSVTemplate,
    downloadRejectedRows,
    downloadHistoryRejectedRows,
    loadImportHistory,
    selectCSVFile,
    prepareCSVPreview,
    confirmImport,
    resetPreview,
  };
}