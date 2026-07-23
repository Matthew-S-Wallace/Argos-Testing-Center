import { useMemo, useState } from "react";
import { createVMRSValidationReportCsv } from "./ARGOS_VMRS_Validation";

const PREVIEW_LIMIT = 100;

function downloadValidationReport(validationResult, originalFilename) {
  const csv = createVMRSValidationReportCsv(validationResult);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const baseName = String(originalFilename || "vmrs-catalog").replace(/\.csv$/i, "");

  anchor.href = url;
  anchor.download = `${baseName}-validation-report.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ARGOSVMRSImportPreview({
  validationResult,
  originalFilename,
  isImporting = false,
  onBack,
  onCancel,
  onImport,
}) {
  const [rowFilter, setRowFilter] = useState("ISSUES");

  const visibleRows = useMemo(() => {
    const allRows = validationResult?.allRows || [];
    const filtered =
      rowFilter === "ALL"
        ? allRows
        : rowFilter === "VALID"
          ? allRows.filter((row) => row.validationStatus === "VALID")
          : rowFilter === "WARNING"
            ? allRows.filter((row) => row.validationStatus === "WARNING")
            : rowFilter === "REJECTED"
              ? allRows.filter((row) => row.validationStatus === "REJECTED")
              : allRows.filter((row) => row.validationStatus !== "VALID");

    return filtered.slice(0, PREVIEW_LIMIT);
  }, [rowFilter, validationResult]);

  if (!validationResult) return null;

  const { summary, fatalErrors = [], rejectedRows = [], warningRows = [] } = validationResult;
  const canImport = !fatalErrors.length && rejectedRows.length === 0 && !isImporting;
  const hasIssueRows = rejectedRows.length > 0 || warningRows.length > 0;

  return (
    <div className="argos-vmrs-preview">
      <div className="argos-vmrs-preview-heading">
        <div>
          <span>Validation Complete</span>
          <strong>{originalFilename || "VMRS catalog"}</strong>
        </div>
        <span className={`argos-vmrs-preview-result ${canImport ? "ready" : "blocked"}`}>
          {canImport ? "Ready to Import" : "Review Required"}
        </span>
      </div>

      <div className="argos-vmrs-preview-summary">
        <div><span>Total Rows</span><strong>{summary.total}</strong></div>
        <div><span>Accepted</span><strong>{summary.accepted}</strong></div>
        <div><span>Warnings</span><strong>{summary.warnings}</strong></div>
        <div><span>Rejected</span><strong>{summary.rejected}</strong></div>
      </div>

      {(fatalErrors.length > 0 || rejectedRows.length > 0) && (
        <div className="argos-vmrs-import-validation error" role="alert">
          <strong>Import cannot continue yet.</strong>
          <span>
            {fatalErrors[0] ||
              `${rejectedRows.length} row${rejectedRows.length === 1 ? "" : "s"} must be corrected before import.`}
          </span>
        </div>
      )}

      {!fatalErrors.length && rejectedRows.length === 0 && warningRows.length > 0 && (
        <div className="argos-vmrs-import-validation warning">
          <strong>Warnings detected.</strong>
          <span>
            {warningRows.length} row{warningRows.length === 1 ? "" : "s"} can be imported but should be reviewed.
          </span>
        </div>
      )}

      <div className="argos-vmrs-preview-details">
        <div><span>Duplicate Rows</span><strong>{summary.duplicateRows}</strong></div>
        <div><span>Missing Parents</span><strong>{summary.missingParents}</strong></div>
        <div><span>Invalid Types</span><strong>{summary.invalidTypes}</strong></div>
      </div>

      <div className="argos-vmrs-preview-toolbar">
        <label>
          <span>Preview Rows</span>
          <select value={rowFilter} onChange={(event) => setRowFilter(event.target.value)}>
            <option value="ISSUES">Warnings & Rejections</option>
            <option value="ALL">All Rows</option>
            <option value="VALID">Accepted Only</option>
            <option value="WARNING">Warnings Only</option>
            <option value="REJECTED">Rejected Only</option>
          </select>
        </label>

        {hasIssueRows && (
          <button
            className="argos-vmrs-secondary-button"
            type="button"
            onClick={() => downloadValidationReport(validationResult, originalFilename)}
          >
            Download Error Report
          </button>
        )}
      </div>

      <div className="argos-vmrs-preview-table-wrap">
        <table className="argos-vmrs-preview-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Status</th>
              <th>Code</th>
              <th>Type</th>
              <th>Description</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr key={`${row.rowNumber}-${row.code}-${row.code_type}`}>
                  <td>{row.rowNumber}</td>
                  <td>
                    <span className={`argos-vmrs-row-status ${row.validationStatus.toLowerCase()}`}>
                      {row.validationStatus}
                    </span>
                  </td>
                  <td><strong>{row.code || "—"}</strong></td>
                  <td>{row.code_type || "—"}</td>
                  <td>{row.description || "—"}</td>
                  <td>
                    {row.validationMessages.length
                      ? row.validationMessages.map((message) => message.message).join(" · ")
                      : "No issues detected"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No rows match the selected preview filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(validationResult?.allRows?.length || 0) > PREVIEW_LIMIT && (
        <p className="argos-vmrs-preview-limit">
          Showing the first {PREVIEW_LIMIT} matching rows. The validation counts include the complete file.
        </p>
      )}

      <div className="argos-vmrs-preview-actions">
        <button className="argos-vmrs-secondary-button" type="button" disabled={isImporting} onClick={onCancel}>
          Cancel
        </button>
        <button className="argos-vmrs-secondary-button" type="button" disabled={isImporting} onClick={onBack}>
          Back
        </button>
        <button className="argos-vmrs-primary-button" type="button" disabled={!canImport} onClick={onImport}>
          {isImporting ? "Importing…" : "Import Catalog"}
        </button>
      </div>
    </div>
  );
}
